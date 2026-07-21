-- ─────────────────────────────────────────────────────────────
--  Top5 — Complete Seed Data v2
--  ครบทุก category มีรูปภาพทุกรายการ
-- ─────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════
--  GEO: Thai Food & Restaurants (กะเพรา)
-- ══════════════════════════════════════════════════════════════
INSERT OR REPLACE INTO entities VALUES
('place_001','ร้านกะเพราเจ๊จุ๋ม','Jae Jum Basil','geo',
 'กะเพราหมูสับเนื้อแน่น ไข่ดาวกรอบกรอบ รสจัดจ้านถูกปาก ราคาย่อมเยา',
 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80','',
 13.7563,100.5018,'สีลม บางรัก กรุงเทพฯ',92,120,datetime('now'),datetime('now','-2 hours')),

('place_002','กะเพราลุงแดง','Uncle Daeng Basil','geo',
 'ต้นตำรับกะเพราไก่แบบดั้งเดิม น้ำมันงาหอม รสชาติสม่ำเสมอ 30 ปี',
 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=400&q=80','',
 13.7460,100.5100,'บางรัก กรุงเทพฯ',88,95,datetime('now'),datetime('now','-5 hours')),

('place_003','ข้าวกะเพราสามย่าน 24hr','Sam Yan Basil 24hr','geo',
 'เปิดตลอด 24 ชั่วโมง กะเพราไก่หมูทะเล ปริมาณจัดเต็มทุกจาน',
 'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=400&q=80','',
 13.7308,100.5299,'สามย่าน ปทุมวัน กรุงเทพฯ',85,80,datetime('now'),datetime('now','-8 hours')),

('place_004','ครัวแม่ทองสุข','Mae Thongsuk Kitchen','geo',
 'กะเพราทะเลสูตรโฮมเมด กุ้งสด ปลาหมึก ปูอัด วัตถุดิบสด ทุกวัน',
 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80','',
 13.7200,100.5150,'สาทร กรุงเทพฯ',82,65,datetime('now'),datetime('now','-12 hours')),

('place_005','กะเพราเรือนไม้','Ruean Mai Basil','geo',
 'บรรยากาศเรือนไม้ไทยย้อนยุค กะเพราเนื้อวากิว A5 Premium คุณภาพระดับพรีเมียม',
 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400&q=80','',
 13.7100,100.5000,'ยานนาวา กรุงเทพฯ',79,55,datetime('now'),datetime('now','-20 hours')),

('place_006','กะเพราตลาดนัดรัชดา','Ratchada Night Market Basil','geo',
 'ราคาเป็นมิตร ปริมาณจัดเต็ม บรรยากาศตลาดนัดคึกคัก',
 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80','',
 13.7650,100.5630,'ลาดพร้าว กรุงเทพฯ',76,42,datetime('now'),datetime('now','-36 hours')),

-- ══════════════════════════════════════════════════════════════
--  GEO: Coffee / Cafe (กาแฟ)
-- ══════════════════════════════════════════════════════════════
('cafe_001','คาเฟ่ Roots','Roots Coffee','geo',
 'สเปเชียลตี้คอฟฟี่คุณภาพสูง Single Origin Beans บรรยากาศมินิมอล',
 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&q=80','',
 13.7308,100.5450,'สุขุมวิท กรุงเทพฯ',94,145,datetime('now'),datetime('now','-1 hours')),

('cafe_002','คาเฟ่ย่านเจริญกรุง','Charoen Krung Cafe','geo',
 'คาเฟ่ตึกเก่าประวัติศาสตร์ริมแม่น้ำเจ้าพระยา บรรยากาศวินเทจ',
 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&q=80','',
 13.7280,100.5150,'เจริญกรุง กรุงเทพฯ',90,120,datetime('now'),datetime('now','-3 hours')),

-- ══════════════════════════════════════════════════════════════
--  WEB3: Cryptocurrencies
-- ══════════════════════════════════════════════════════════════
('crypto_001','Bitcoin','Bitcoin','web3',
 'สกุลเงินดิจิทัลที่ใหญ่ที่สุดในโลก ผู้บุกเบิก Blockchain เกิดปี 2009 โดย Satoshi',
 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400&q=80',
 'https://bitcoin.org',0,0,NULL,95,180,datetime('now'),datetime('now','-1 hours')),

('crypto_002','Ethereum','Ethereum','web3',
 'แพลตฟอร์ม Smart Contract ชั้นนำ รองรับ DeFi, NFT และ Web3 Apps ทั่วโลก',
 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=400&q=80',
 'https://ethereum.org',0,0,NULL,90,160,datetime('now'),datetime('now','-3 hours')),

('crypto_003','Solana','Solana','web3',
 'Blockchain ความเร็วสูง 65,000 TPS ค่า Gas ต่ำมาก รองรับ NFT และ DeFi',
 'https://images.unsplash.com/photo-1639762681057-408e52192e55?w=400&q=80',
 'https://solana.com',0,0,NULL,82,140,datetime('now'),datetime('now','-6 hours')),

('crypto_004','BNB','Binance Coin','web3',
 'Token ระบบนิเวศ Binance ใช้ลดค่าธรรมเนียมซื้อขาย และ BNB Chain',
 'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=400&q=80',
 'https://bnbchain.org',0,0,NULL,78,110,datetime('now'),datetime('now','-10 hours')),

('crypto_005','Cardano','Cardano','web3',
 'Blockchain เชิงวิชาการ Peer-reviewed Research ออกแบบโดย IOHK',
 'https://images.unsplash.com/photo-1605792657660-596af9009e82?w=400&q=80',
 'https://cardano.org',0,0,NULL,72,90,datetime('now'),datetime('now','-15 hours')),

('crypto_006','Polygon','Polygon','web3',
 'Layer 2 Scaling สำหรับ Ethereum ค่า Gas ถูก เร็ว รองรับ dApps หลายพัน',
 'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=400&q=80',
 'https://polygon.technology',0,0,NULL,68,75,datetime('now'),datetime('now','-24 hours')),

-- ══════════════════════════════════════════════════════════════
--  DEV: Programming Languages
-- ══════════════════════════════════════════════════════════════
('lang_001','Python','Python','dev',
 'ภาษาอันดับ 1 ด้าน AI/ML, Data Science, Automation ใช้ง่าย ชุมชนใหญ่ที่สุด',
 'https://images.unsplash.com/photo-1526379879527-8559ecfcaec0?w=400&q=80',
 'https://python.org',0,0,NULL,98,190,datetime('now'),datetime('now','-2 hours')),

('lang_002','JavaScript','JavaScript','dev',
 'ภาษา Web ที่ครองทั้ง Frontend และ Backend (Node.js, Deno, Bun)',
 'https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=400&q=80',
 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',0,0,NULL,95,175,datetime('now'),datetime('now','-4 hours')),

('lang_003','TypeScript','TypeScript','dev',
 'JavaScript + Static Type Safety ที่ทำให้ Large Codebase บริหารจัดการได้',
 'https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=400&q=80',
 'https://typescriptlang.org',0,0,NULL,92,165,datetime('now'),datetime('now','-5 hours')),

('lang_004','Rust','Rust','dev',
 'ภาษาที่เร็วเท่า C/C++ แต่ Memory-safe ไม่มี GC เหมาะ Systems & WebAssembly',
 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400&q=80',
 'https://rust-lang.org',0,0,NULL,88,150,datetime('now'),datetime('now','-7 hours')),

('lang_005','Go','Go','dev',
 'ภาษา Google เหมาะ Microservices, Cloud Native, Kubernetes เร็วและเรียบง่าย',
 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80',
 'https://go.dev',0,0,NULL,85,130,datetime('now'),datetime('now','-10 hours')),

('lang_006','Kotlin','Kotlin','dev',
 'ภาษา Android อย่างเป็นทางการ สั้นกว่า Java Null-safe ทำงานบน JVM',
 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=400&q=80',
 'https://kotlinlang.org',0,0,NULL,78,100,datetime('now'),datetime('now','-18 hours')),

-- ══════════════════════════════════════════════════════════════
--  POPCULTURE: Most Handsome Men / Celebrities
-- ══════════════════════════════════════════════════════════════
('pop_001','BTS V (Kim Taehyung)','V (BTS)','popculture',
 'ศิลปิน K-POP อันดับ 1 TC Candler Most Handsome Faces นักแสดง นักร้อง จิตรกร',
 'https://images.unsplash.com/photo-1493863641943-9b68992a8d07?w=400&q=80',
 'https://www.instagram.com/thv',0,0,NULL,98,200,datetime('now'),datetime('now','-1 hours')),

('pop_002','Lee Min-ho','Lee Min-ho','popculture',
 'นักแสดงเกาหลีที่ดังที่สุดในเอเชีย Boys Over Flowers, The King: Eternal Monarch',
 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
 'https://www.instagram.com/leeminho',0,0,NULL,96,185,datetime('now'),datetime('now','-3 hours')),

('pop_003','Timothée Chalamet','Timothée Chalamet','popculture',
 'นักแสดงฮอลลีวูด Dune, Wonka, Call Me by Your Name ไอคอนแฟชั่นระดับโลก',
 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80',
 'https://www.instagram.com/tchalamet',0,0,NULL,94,170,datetime('now'),datetime('now','-5 hours')),

('pop_004','Henry Cavill','Henry Cavill','popculture',
 'Superman, Geralt of Rivia ใน The Witcher นักแสดงและเกมเมอร์ตัวจริง',
 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80',
 'https://www.instagram.com/henrycavill',0,0,NULL,90,155,datetime('now'),datetime('now','-8 hours')),

('pop_005','Chris Hemsworth','Chris Hemsworth','popculture',
 'Thor ใน MCU นักแสดงออสเตรเลีย ฟิตเนสและ Lifestyle Influencer ระดับโลก',
 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80',
 'https://www.instagram.com/chrishemsworth',0,0,NULL,88,140,datetime('now'),datetime('now','-12 hours')),

('pop_006','Tom Holland','Tom Holland','popculture',
 'Spider-Man ใน MCU นักแสดงและนักเต้นจากอังกฤษ Uncharted, Cherry',
 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=400&q=80',
 'https://www.instagram.com/tomholland2013',0,0,NULL,85,125,datetime('now'),datetime('now','-20 hours')),

-- ══════════════════════════════════════════════════════════════
--  ACADEMIC: Astronomy & Science
-- ══════════════════════════════════════════════════════════════
('sci_001','James Webb Space Telescope','JWST','academic',
 'กล้องโทรทรรศน์อวกาศที่ทรงพลังที่สุดเท่าที่มนุษยชาติเคยสร้าง มูลค่า $10 พันล้าน',
 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&q=80',
 'https://webb.nasa.gov',0,0,NULL,99,180,datetime('now'),datetime('now','-2 hours')),

('sci_002','Black Hole M87*','Black Hole M87*','academic',
 'หลุมดำมวล 6.5 พันล้านดวงอาทิตย์ ภาพถ่ายครั้งแรกในประวัติศาสตร์ปี 2019 โดย EHT',
 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400&q=80',
 'https://eventhorizontelescope.org',0,0,NULL,97,150,datetime('now'),datetime('now','-4 hours')),

('sci_003','Sagittarius A*','Sgr A* Black Hole','academic',
 'หลุมดำมวล 4 ล้านดวงอาทิตย์ ใจกลางกาแล็กซีทางช้างเผือก ถ่ายภาพครั้งแรกปี 2022',
 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&q=80',
 'https://eventhorizontelescope.org',0,0,NULL,95,140,datetime('now'),datetime('now','-6 hours')),

('sci_004','Gravitational Waves','Gravitational Waves LIGO','academic',
 'คลื่นความโน้มถ่วงจากการชนกันของหลุมดำ ตรวจพบโดย LIGO ยืนยันทฤษฎี Einstein',
 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400&q=80',
 'https://www.ligo.org',0,0,NULL,92,120,datetime('now'),datetime('now','-10 hours')),

('sci_005','TRAPPIST-1e','TRAPPIST-1e Exoplanet','academic',
 'ดาวเคราะห์นอกระบบสุริยะในเขต Habitable Zone อาจมีน้ำและสิ่งมีชีวิต ห่าง 39 ปีแสง',
 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&q=80',
 'https://www.nasa.gov/trappist',0,0,NULL,88,100,datetime('now'),datetime('now','-14 hours')),

('sci_006','Dark Matter','สสารมืด / Dark Matter','academic',
 'สสารลึกลับ 27% ของจักรวาล ไม่สามารถมองเห็นหรือตรวจจับได้โดยตรง ยังเป็นปริศนา',
 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=400&q=80',
 'https://science.nasa.gov/universe/dark-matter-dark-energy/',0,0,NULL,90,110,datetime('now'),datetime('now','-18 hours'));
