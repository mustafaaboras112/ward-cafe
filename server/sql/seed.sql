USE ward_cafe;

INSERT INTO menu_items (id,name,category,price,description,image_url,available) VALUES
(1,'قهوة تركية ورد','hot',40.00,'قهوة أصيلة ساخنة برغوة غنية','q.png',1),
(2,'لاتيه كافيه ورد','hot',60.00,'إسبريسو مع حليب ناعم','q.png',1),
(3,'موهيتو بيري','cold',75.00,'نكهة التوت المنعشة مع الصودا والنعناع','q.png',1),
(4,'تشيز كيك الفراولة','sweets',90.00,'تشيز كيك مع صوص الفراولة','q.png',1),
(5,'ساندويش دجاج ورد','food',120.00,'دجاج مشوي مع خضار وصوص خاص','q.png',1),
(6,'برغر كافيه ورد','food',150.00,'برغر لحم مع الجبن والبطاطا','q.png',1),
(7,'طبق فطور شرقي','food',135.00,'بيض وجبن وزيتون وخضار','q.png',1)
ON DUPLICATE KEY UPDATE
  name=VALUES(name),category=VALUES(category),price=VALUES(price),description=VALUES(description),image_url=VALUES(image_url),available=VALUES(available);
