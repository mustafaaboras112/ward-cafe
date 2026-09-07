'use strict';
const digits=value=>String(value ?? '').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776)));
const validNumber=value=>typeof value==='string' && /^[0-9]{4,12}$/.test(value);
const validPin=value=>typeof value==='string' && /^[0-9]{12,20}$/.test(value);
const loginEmail=number=>`${number}@staff.ward.invalid`;
module.exports={digits,validNumber,validPin,loginEmail};
