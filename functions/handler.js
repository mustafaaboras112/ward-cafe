'use strict';

const { ActionError, applyAction, exactKeys, resolveActor } = require('./actions');

// Dependency injection permits checking the actual callable handler without live credentials.
function makeWardHandler({ auth, database, HttpsError, logger, clock = Date.now }) {
    return async request => {
        try {
            if (!request.app) throw new ActionError('unauthenticated', 'تعذر التحقق من التطبيق.');
            if (!request.auth?.uid) throw new ActionError('unauthenticated', 'يرجى تسجيل الدخول.');
            exactKeys(request.data, ['action', 'data']);
            if (Buffer.byteLength(JSON.stringify(request.data), 'utf8') > 65536) {
                throw new ActionError('invalid-argument', 'حجم الطلب أكبر من المسموح.');
            }
            const authorization = request.rawRequest?.headers?.authorization;
            const match = typeof authorization === 'string' && /^Bearer ([^\s]+)$/i.exec(authorization);
            if (!match) throw new ActionError('unauthenticated', 'يرجى تسجيل الدخول مجدداً.');
            let token;
            try { token = await auth.verifyIdToken(match[1], true); }
            catch { throw new ActionError('unauthenticated', 'انتهت الجلسة أو تم إيقاف الحساب. سجّل الدخول مجدداً.'); }
            if (token.uid !== request.auth.uid) throw new ActionError('unauthenticated', 'الجلسة غير صالحة.');
            const ref = database.ref();
            // Admin transaction callbacks initially receive cached null on cold starts.
            // Prime the snapshot; only its transaction successor is ever used for business logic.
            await ref.once('value');
            const now = clock();
            let failure, response;
            const transaction = await ref.transaction(current => {
                failure = null;
                response = undefined;
                try {
                    const actor = resolveActor(current || {}, token, now);
                    const changed = applyAction(current, actor, request.data.action, request.data.data, now);
                    response = changed.result;
                    return changed.state;
                } catch (error) { failure = error; return undefined; }
            }, undefined, false);
            if (!transaction.committed) throw failure || new ActionError('aborted', 'تعذر حفظ العملية، أعد المحاولة.');
            // Never expose the root transaction snapshot, staff registry, audit or other customers.
            return response;
        } catch (error) {
            if (error instanceof ActionError) throw new HttpsError(error.code, error.message);
            logger.error('wardAction failed', { code: error?.code || 'internal', action: typeof request.data?.action === 'string' ? request.data.action.slice(0, 50) : 'invalid' });
            throw new HttpsError('internal', 'تعذر إكمال العملية. حاول مجدداً أو راجع المسؤول.');
        }
    };
}

module.exports = { makeWardHandler };
