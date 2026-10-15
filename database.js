const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'village_dairy.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for durability and performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  console.log('Initializing Village Dairy SQLite Database...');

  // 1. Farmers Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS farmers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      village TEXT NOT NULL DEFAULT 'Rampur Village',
      phone TEXT,
      cattle_count INTEGER DEFAULT 2,
      cattle_type TEXT DEFAULT 'Cow & Buffalo',
      bank_acc_or_upi TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 2. Milk Collections Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS milk_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id INTEGER NOT NULL,
      collection_date TEXT NOT NULL,
      shift TEXT NOT NULL, -- 'Morning' or 'Evening'
      milk_type TEXT NOT NULL, -- 'Cow' or 'Buffalo'
      quantity_liters REAL NOT NULL,
      fat_percentage REAL NOT NULL,
      snf_percentage REAL NOT NULL DEFAULT 8.5,
      rate_per_liter REAL NOT NULL,
      total_amount REAL NOT NULL,
      payment_status TEXT DEFAULT 'Unpaid', -- 'Unpaid' or 'Paid'
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE RESTRICT
    );
  `);

  // 3. Products Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_hi TEXT,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      image_url TEXT,
      in_stock INTEGER DEFAULT 1,
      badge TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 4. Customer Orders Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      village_or_address TEXT NOT NULL,
      delivery_shift TEXT DEFAULT 'Morning',
      order_type TEXT DEFAULT 'Daily Subscription',
      items_json TEXT NOT NULL,
      total_amount REAL NOT NULL,
      payment_mode TEXT DEFAULT 'Cash on Delivery',
      order_status TEXT DEFAULT 'Pending',
      special_notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 5. Rate Chart Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_chart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milk_type TEXT UNIQUE NOT NULL,
      base_fat REAL NOT NULL,
      base_snf REAL NOT NULL,
      base_rate REAL NOT NULL,
      fat_step_rate REAL NOT NULL,
      snf_step_rate REAL NOT NULL,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 6. Dairy General Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS dairy_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  seedInitialData();
  cleanEnglishData();
}

function cleanEnglishData() {
  // Ensure all names and settings are in English only
  try {
    db.exec(`
      UPDATE farmers SET name = 'Ramesh Patel' WHERE farmer_code = 'F-101';
      UPDATE farmers SET name = 'Suresh Yadav' WHERE farmer_code = 'F-102';
      UPDATE farmers SET name = 'Meena Devi' WHERE farmer_code = 'F-103';
      UPDATE farmers SET name = 'Baldev Singh' WHERE farmer_code = 'F-104';
      UPDATE farmers SET name = 'Ramcharan Verma' WHERE farmer_code = 'F-105';
      UPDATE dairy_settings SET value = 'Village Green Dairy Farm & Milk Center' WHERE key = 'dairy_name';
      UPDATE products SET name_hi = '';
    `);
  } catch (e) {
    console.error('Error cleaning English data:', e);
  }
}

function seedInitialData() {
  // Check if rate_chart already exists
  const rateCount = db.prepare('SELECT COUNT(*) as count FROM rate_chart').get().count;
  if (rateCount === 0) {
    console.log('Seeding Rate Chart...');
    const insertRate = db.prepare(`
      INSERT INTO rate_chart (milk_type, base_fat, base_snf, base_rate, fat_step_rate, snf_step_rate)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    // Cow milk: Base 3.5 Fat, 8.5 SNF => $42.00 base, $0.60 per 0.1 Fat diff, $0.30 per 0.1 SNF diff
    insertRate.run('Cow', 3.5, 8.5, 42.0, 0.60, 0.30);
    // Buffalo milk: Base 6.0 Fat, 9.0 SNF => $58.00 base, $0.75 per 0.1 Fat diff, $0.35 per 0.1 SNF diff
    insertRate.run('Buffalo', 6.0, 9.0, 58.0, 0.75, 0.35);
  }

  // Check if farmers exist
  const farmerCount = db.prepare('SELECT COUNT(*) as count FROM farmers').get().count;
  if (farmerCount === 0) {
    console.log('Seeding Initial Village Farmers...');
    const insertFarmer = db.prepare(`
      INSERT INTO farmers (farmer_code, name, village, phone, cattle_count, cattle_type, bank_acc_or_upi)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertFarmer.run('F-101', 'Ramesh Patel', 'Rampur Kalan', '9876543210', 4, 'Cow', 'ramesh@upi');
    insertFarmer.run('F-102', 'Suresh Yadav', 'Shivgarh', '9811223344', 6, 'Buffalo', 'suresh.yadav@sbi');
    insertFarmer.run('F-103', 'Meena Devi', 'Kishanpur', '9722334455', 3, 'Cow & Buffalo', 'meena.devi@paytm');
    insertFarmer.run('F-104', 'Baldev Singh', 'Rampur Kalan', '9899001122', 5, 'Buffalo', 'baldevsingh@pnb');
    insertFarmer.run('F-105', 'Ramcharan Verma', 'Dharampur', '9933445566', 2, 'Cow', 'ramcharan@ybl');
  }

  // Check if products exist
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (productCount === 0) {
    console.log('Seeding Fresh Village Dairy Products...');
    const insertProduct = db.prepare(`
      INSERT INTO products (name, name_hi, category, unit, price, description, image_url, badge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertProduct.run(
      'Pure Farm Desi Cow Milk (A2)',
      '',
      'Milk',
      '1 Liter',
      55.0,
      'Raw, unprocessed, farm-fresh milk directly from grass-fed Desi Gir & Sahiwal cows. Rich in A2 beta-casein protein and natural goodness.',
      'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
      'Best Seller'
    );

    insertProduct.run(
      'Rich Cream Buffalo Milk',
      '',
      'Milk',
      '1 Liter',
      70.0,
      'High-fat creamy buffalo milk ideal for tea, coffee, homemade desserts, and thick curd. 7.0%+ natural fat guarantee.',
      'https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?auto=format&fit=crop&w=600&q=80',
      'High Fat'
    );

    insertProduct.run(
      'Traditional Bilona Pure Ghee',
      '',
      'Ghee',
      '1 Kg',
      850.0,
      'Prepared through ancient traditional bilona method (curd churning), hand-crafted by village dairy artisans. Golden aroma and grainy texture.',
      'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=600&q=80',
      '100% Pure'
    );

    insertProduct.run(
      'Fresh Village Malai Paneer',
      '',
      'Paneer',
      '500 gm',
      190.0,
      'Ultra soft, melt-in-mouth cottage cheese crafted daily using fresh lemon coagulant. No starch or synthetic preservatives.',
      'https://images.unsplash.com/photo-1589927986089-35812388d1f4?auto=format&fit=crop&w=600&q=80',
      'Fresh Daily'
    );

    insertProduct.run(
      'Clay Pot Fresh Curd (Dahi)',
      '',
      'Curd',
      '1 Kg',
      80.0,
      'Thick, naturally sweet probiotic curd set traditionally in terracotta earthen pots for rich earthy flavor and digestion.',
      'https://images.unsplash.com/photo-1571212515416-fef01fc43637?auto=format&fit=crop&w=600&q=80',
      'Clay Pot'
    );

    insertProduct.run(
      'Farm Fresh White Butter',
      '',
      'Butter & Others',
      '500 gm',
      240.0,
      'Authentic village churned unsalted white butter. Loved with hot breads, toasts, and traditional breakfast meals.',
      'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80',
      'Hand Churned'
    );

    insertProduct.run(
      'Spiced Village Buttermilk',
      '',
      'Butter & Others',
      '1 Liter',
      35.0,
      'Refreshing digestive beverage churned with roasted cumin, mint, rock salt, and ginger. Cooling and wholesome.',
      'https://images.unsplash.com/photo-1543362906-acfc16c67564?auto=format&fit=crop&w=600&q=80',
      'Cool & Healthy'
    );
  }

  // Seed some recent milk collections for today
  const collectionCount = db.prepare('SELECT COUNT(*) as count FROM milk_collections').get().count;
  if (collectionCount === 0) {
    console.log('Seeding Recent Milk Collections...');
    const today = new Date().toISOString().split('T')[0];
    const insertCollection = db.prepare(`
      INSERT INTO milk_collections (farmer_id, collection_date, shift, milk_type, quantity_liters, fat_percentage, snf_percentage, rate_per_liter, total_amount, payment_status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertCollection.run(1, today, 'Morning', 'Cow', 18.5, 4.1, 8.6, 45.90, 849.15, 'Paid', 'Morning supply - excellent quality');
    insertCollection.run(2, today, 'Morning', 'Buffalo', 24.0, 6.8, 9.2, 64.70, 1552.80, 'Paid', 'Fresh buffalo milk');
    insertCollection.run(3, today, 'Morning', 'Cow', 12.0, 3.8, 8.5, 43.80, 525.60, 'Unpaid', 'Regular delivery');
    insertCollection.run(4, today, 'Morning', 'Buffalo', 31.5, 7.1, 9.1, 66.60, 2097.90, 'Paid', 'High fat batch');
    insertCollection.run(5, today, 'Morning', 'Cow', 9.5, 3.6, 8.4, 42.30, 401.85, 'Unpaid', 'Regular delivery');
  }

  // Seed sample customer order / subscription
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM customer_orders').get().count;
  if (orderCount === 0) {
    console.log('Seeding Sample Customer Orders...');
    const insertOrder = db.prepare(`
      INSERT INTO customer_orders (order_number, customer_name, customer_phone, village_or_address, delivery_shift, order_type, items_json, total_amount, payment_mode, order_status, special_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertOrder.run(
      'ORD-202610-001',
      'Sunil Sharma',
      '9811002233',
      'House No. 14, Main Market, Rampur Village',
      'Morning',
      'Daily Subscription',
      JSON.stringify([
        { id: 1, name: 'Pure Farm Desi Cow Milk (A2)', quantity: 2, price: 55, unit: '1 Liter' }
      ]),
      110.0,
      'Cash on Delivery',
      'Confirmed',
      'Please deliver before 6:30 AM at front door'
    );

    insertOrder.run(
      'ORD-202610-002',
      'Dr. Priya Saxena',
      '9877441122',
      'Near Village Primary Health Center, Ward 3',
      'Morning',
      'One-time Order',
      JSON.stringify([
        { id: 3, name: 'Traditional Bilona Pure Ghee', quantity: 1, price: 850, unit: '1 Kg' },
        { id: 4, name: 'Fresh Village Malai Paneer', quantity: 2, price: 190, unit: '500 gm' }
      ]),
      1230.0,
      'UPI / Online',
      'Out for Delivery',
      'Payment done via UPI'
    );
  }

  // Set default dairy profile in settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM dairy_settings').get().count;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT OR REPLACE INTO dairy_settings (key, value) VALUES (?, ?)');
    insertSetting.run('dairy_name', 'Village Green Dairy Farm & Milk Center');
    insertSetting.run('village_name', 'Rampur Village, Milk Dairy Hub');
    insertSetting.run('contact_phone', '+91 98765 43210');
    insertSetting.run('whatsapp_number', '+91 98765 43210');
    insertSetting.run('morning_time', '05:30 AM - 08:30 AM');
    insertSetting.run('evening_time', '05:00 PM - 08:00 PM');
    insertSetting.run('dairy_tagline', '100% Pure, Fresh & Untouched Village Milk Directly from Farm to Your Doorstep');
  }

  console.log('Database initialized successfully with all tables and data.');
}

// Function to calculate rate based on Milk Type, Fat and SNF
function calculateMilkRate(milkType, fat, snf) {
  const chart = db.prepare('SELECT * FROM rate_chart WHERE milk_type = ?').get(milkType);
  if (!chart) {
    // Fallback default
    return milkType === 'Cow' ? 42.0 : 58.0;
  }

  const fatDiff = (fat - chart.base_fat) * 10; // each 0.1 difference
  const snfDiff = (snf - chart.base_snf) * 10; // each 0.1 difference

  let rate = chart.base_rate + (fatDiff * chart.fat_step_rate) + (snfDiff * chart.snf_step_rate);
  if (rate < 25.0) rate = 25.0; // Minimum safety floor
  return Math.round(rate * 100) / 100;
}

module.exports = {
  db,
  initDatabase,
  calculateMilkRate
};
