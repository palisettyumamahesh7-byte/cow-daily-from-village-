const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { db, initDatabase, calculateMilkRate } = require('./database');

// Initialize database tables and initial records
initDatabase();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. HEALTH & GENERAL SETTINGS APIS
// ==========================================
app.get('/api/health', (req, res) => {
  const settingsRows = db.prepare('SELECT key, value FROM dairy_settings').all();
  const settings = {};
  settingsRows.forEach(s => { settings[s.key] = s.value; });

  res.json({
    status: 'online',
    appName: 'Gaon Village Milk Dairy Management System',
    timestamp: new Date().toISOString(),
    settings
  });
});

app.get('/api/settings', (req, res) => {
  const settingsRows = db.prepare('SELECT key, value FROM dairy_settings').all();
  const settings = {};
  settingsRows.forEach(s => { settings[s.key] = s.value; });
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const updates = req.body;
  const insertOrUpdate = db.prepare('INSERT OR REPLACE INTO dairy_settings (key, value) VALUES (?, ?)');
  
  for (const [key, value] of Object.entries(updates)) {
    insertOrUpdate.run(key, String(value));
  }
  res.json({ success: true, message: 'Settings updated successfully' });
});

// ==========================================
// 2. DASHBOARD & STATS APIS
// ==========================================
app.get('/api/dashboard', (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split('T')[0];

    // Today's milk stats
    const todayStats = db.prepare(`
      SELECT 
        COUNT(*) as total_entries,
        COALESCE(SUM(quantity_liters), 0) as total_liters,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(AVG(fat_percentage), 0) as avg_fat,
        COALESCE(SUM(CASE WHEN shift = 'Morning' THEN quantity_liters ELSE 0 END), 0) as morning_liters,
        COALESCE(SUM(CASE WHEN shift = 'Evening' THEN quantity_liters ELSE 0 END), 0) as evening_liters,
        COALESCE(SUM(CASE WHEN milk_type = 'Cow' THEN quantity_liters ELSE 0 END), 0) as cow_liters,
        COALESCE(SUM(CASE WHEN milk_type = 'Buffalo' THEN quantity_liters ELSE 0 END), 0) as buffalo_liters
      FROM milk_collections 
      WHERE collection_date = ?
    `).get(today);

    // Total registered farmers
    const farmerStats = db.prepare(`
      SELECT 
        COUNT(*) as total_farmers,
        COALESCE(SUM(cattle_count), 0) as total_cattle
      FROM farmers
    `).get();

    // Customer orders stats
    const orderStats = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(CASE WHEN order_status = 'Pending' THEN 1 ELSE 0 END), 0) as pending_orders,
        COALESCE(SUM(CASE WHEN order_status = 'Delivered' THEN 1 ELSE 0 END), 0) as delivered_orders,
        COALESCE(SUM(total_amount), 0) as total_sales
      FROM customer_orders
    `).get();

    // Last 7 days collection trend
    const recentDaysTrend = db.prepare(`
      SELECT 
        collection_date,
        SUM(quantity_liters) as total_liters,
        SUM(total_amount) as total_payout
      FROM milk_collections
      GROUP BY collection_date
      ORDER BY collection_date DESC
      LIMIT 7
    `).all();

    // Recent 5 milk collection entries
    const recentEntries = db.prepare(`
      SELECT 
        c.*,
        f.farmer_code,
        f.name as farmer_name,
        f.village as farmer_village
      FROM milk_collections c
      JOIN farmers f ON c.farmer_id = f.id
      ORDER BY c.id DESC
      LIMIT 5
    `).all();

    res.json({
      success: true,
      date: today,
      today: {
        total_entries: todayStats.total_entries,
        total_liters: Number(todayStats.total_liters.toFixed(2)),
        total_amount: Number(todayStats.total_amount.toFixed(2)),
        avg_fat: Number(todayStats.avg_fat.toFixed(2)),
        morning_liters: Number(todayStats.morning_liters.toFixed(2)),
        evening_liters: Number(todayStats.evening_liters.toFixed(2)),
        cow_liters: Number(todayStats.cow_liters.toFixed(2)),
        buffalo_liters: Number(todayStats.buffalo_liters.toFixed(2))
      },
      farmers: farmerStats,
      orders: orderStats,
      recentDaysTrend: recentDaysTrend.reverse(),
      recentEntries
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. DAILY MILK COLLECTION APIS
// ==========================================
app.get('/api/collections', (req, res) => {
  try {
    const { date, shift, farmer_id, milk_type } = req.query;
    let query = `
      SELECT 
        c.*,
        f.farmer_code,
        f.name as farmer_name,
        f.phone as farmer_phone,
        f.village as farmer_village
      FROM milk_collections c
      JOIN farmers f ON c.farmer_id = f.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += ` AND c.collection_date = ?`;
      params.push(date);
    }
    if (shift && shift !== 'All') {
      query += ` AND c.shift = ?`;
      params.push(shift);
    }
    if (farmer_id) {
      query += ` AND c.farmer_id = ?`;
      params.push(farmer_id);
    }
    if (milk_type && milk_type !== 'All') {
      query += ` AND c.milk_type = ?`;
      params.push(milk_type);
    }

    query += ` ORDER BY c.id DESC`;

    const records = db.prepare(query).all(...params);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/collections', (req, res) => {
  try {
    const {
      farmer_id,
      collection_date,
      shift,
      milk_type,
      quantity_liters,
      fat_percentage,
      snf_percentage = 8.5,
      payment_status = 'Unpaid',
      remarks = ''
    } = req.body;

    if (!farmer_id || !collection_date || !shift || !milk_type || !quantity_liters || !fat_percentage) {
      return res.status(400).json({ error: 'Missing required milk entry fields' });
    }

    // Verify farmer exists
    const farmer = db.prepare('SELECT * FROM farmers WHERE id = ?').get(farmer_id);
    if (!farmer) {
      return res.status(404).json({ error: 'Farmer not found with provided ID' });
    }

    const qty = parseFloat(quantity_liters);
    const fat = parseFloat(fat_percentage);
    const snf = parseFloat(snf_percentage);

    // Calculate dynamic rate based on formula
    const ratePerLiter = calculateMilkRate(milk_type, fat, snf);
    const totalAmount = Math.round(qty * ratePerLiter * 100) / 100;

    const stmt = db.prepare(`
      INSERT INTO milk_collections (
        farmer_id, collection_date, shift, milk_type,
        quantity_liters, fat_percentage, snf_percentage,
        rate_per_liter, total_amount, payment_status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      farmer_id,
      collection_date,
      shift,
      milk_type,
      qty,
      fat,
      snf,
      ratePerLiter,
      totalAmount,
      payment_status,
      remarks
    );

    // Fetch the newly inserted record with farmer details for thermal slip printing
    const newRecord = db.prepare(`
      SELECT 
        c.*,
        f.farmer_code,
        f.name as farmer_name,
        f.phone as farmer_phone,
        f.village as farmer_village,
        f.bank_acc_or_upi
      FROM milk_collections c
      JOIN farmers f ON c.farmer_id = f.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: 'Milk collection entry recorded successfully',
      data: newRecord
    });
  } catch (error) {
    console.error('Error saving milk collection:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle payment status (Paid / Unpaid)
app.patch('/api/collections/:id/payment', (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status } = req.body;
    
    const validStatus = payment_status === 'Paid' ? 'Paid' : 'Unpaid';
    const stmt = db.prepare('UPDATE milk_collections SET payment_status = ? WHERE id = ?');
    const info = stmt.run(validStatus, id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Milk record not found' });
    }

    res.json({ success: true, message: `Payment status updated to ${validStatus}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete milk collection record
app.delete('/api/collections/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM milk_collections WHERE id = ?');
    const info = stmt.run(id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ success: true, message: 'Milk record deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. FARMERS DIRECTORY & LEDGER APIS
// ==========================================
app.get('/api/farmers', (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const farmers = db.prepare(`
      SELECT 
        f.*,
        COUNT(c.id) as total_supplies,
        COALESCE(SUM(c.quantity_liters), 0) as total_liters_supplied,
        COALESCE(SUM(c.total_amount), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN c.payment_status = 'Unpaid' THEN c.total_amount ELSE 0 END), 0) as pending_balance
      FROM farmers f
      LEFT JOIN milk_collections c ON f.id = c.farmer_id
      WHERE f.name LIKE ? OR f.farmer_code LIKE ? OR f.phone LIKE ? OR f.village LIKE ?
      GROUP BY f.id
      ORDER BY f.id ASC
    `).all(search, search, search, search);

    res.json(farmers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/farmers', (req, res) => {
  try {
    const {
      farmer_code,
      name,
      village = 'Village Green',
      phone = '',
      cattle_count = 1,
      cattle_type = 'Cow',
      bank_acc_or_upi = ''
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Farmer name is required' });
    }

    // Auto-generate farmer code if not provided
    let code = farmer_code;
    if (!code) {
      const lastFarmer = db.prepare('SELECT id FROM farmers ORDER BY id DESC LIMIT 1').get();
      const nextId = (lastFarmer ? lastFarmer.id : 0) + 101;
      code = `F-${nextId}`;
    }

    const stmt = db.prepare(`
      INSERT INTO farmers (farmer_code, name, village, phone, cattle_count, cattle_type, bank_acc_or_upi)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(code, name, village, phone, cattle_count, cattle_type, bank_acc_or_upi);
    const newFarmer = db.prepare('SELECT * FROM farmers WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: 'Farmer registered successfully',
      data: newFarmer
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed: farmers.farmer_code')) {
      return res.status(400).json({ error: 'Farmer code already exists. Please use a unique code.' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/farmers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const farmer = db.prepare('SELECT * FROM farmers WHERE id = ?').get(id);

    if (!farmer) {
      return res.status(404).json({ error: 'Farmer not found' });
    }

    // Farmer's milk supply ledger
    const ledger = db.prepare(`
      SELECT * FROM milk_collections 
      WHERE farmer_id = ? 
      ORDER BY collection_date DESC, id DESC
    `).all(id);

    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total_entries,
        COALESCE(SUM(quantity_liters), 0) as total_liters,
        COALESCE(SUM(total_amount), 0) as total_payout,
        COALESCE(SUM(CASE WHEN payment_status = 'Unpaid' THEN total_amount ELSE 0 END), 0) as unpaid_balance
      FROM milk_collections
      WHERE farmer_id = ?
    `).get(id);

    res.json({
      farmer,
      summary,
      ledger
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. PRODUCTS & STORE APIS
// ==========================================
app.get('/api/products', (req, res) => {
  try {
    const { category, in_stock } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }
    if (in_stock !== undefined) {
      query += ' AND in_stock = ?';
      params.push(in_stock === 'true' ? 1 : 0);
    }

    query += ' ORDER BY id ASC';
    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const { name, name_hi, category, unit, price, description, image_url, badge } = req.body;
    if (!name || !category || !unit || !price) {
      return res.status(400).json({ error: 'Name, category, unit, and price are required' });
    }

    const stmt = db.prepare(`
      INSERT INTO products (name, name_hi, category, unit, price, description, image_url, badge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name,
      name_hi || name,
      category,
      unit,
      parseFloat(price),
      description || '',
      image_url || 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
      badge || ''
    );

    const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. CUSTOMER ORDERS & SUBSCRIPTIONS APIS
// ==========================================
app.get('/api/orders', (req, res) => {
  try {
    const { status, phone } = req.query;
    let query = 'SELECT * FROM customer_orders WHERE 1=1';
    const params = [];

    if (status && status !== 'All') {
      query += ' AND order_status = ?';
      params.push(status);
    }
    if (phone) {
      query += ' AND customer_phone LIKE ?';
      params.push(`%${phone}%`);
    }

    query += ' ORDER BY id DESC';
    const orders = db.prepare(query).all(...params);

    // Parse JSON items
    const parsedOrders = orders.map(o => {
      try {
        return { ...o, items: JSON.parse(o.items_json) };
      } catch (e) {
        return { ...o, items: [] };
      }
    });

    res.json(parsedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      village_or_address,
      delivery_shift = 'Morning',
      order_type = 'Daily Subscription',
      items,
      total_amount,
      payment_mode = 'Cash on Delivery',
      special_notes = ''
    } = req.body;

    if (!customer_name || !customer_phone || !village_or_address || !items || items.length === 0) {
      return res.status(400).json({ error: 'Please provide customer details and at least one item' });
    }

    // Generate unique order number: ORD-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${dateStr}-${randPart}`;

    const stmt = db.prepare(`
      INSERT INTO customer_orders (
        order_number, customer_name, customer_phone, village_or_address,
        delivery_shift, order_type, items_json, total_amount,
        payment_mode, order_status, special_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?)
    `);

    const result = stmt.run(
      orderNumber,
      customer_name,
      customer_phone,
      village_or_address,
      delivery_shift,
      order_type,
      JSON.stringify(items),
      parseFloat(total_amount),
      payment_mode,
      special_notes
    );

    const createdOrder = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(result.lastInsertRowid);
    createdOrder.items = items;

    res.status(201).json({
      success: true,
      message: 'Order / Subscription registered successfully!',
      order: createdOrder
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update order status (Pending, Confirmed, Out for Delivery, Delivered, Cancelled)
app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const stmt = db.prepare('UPDATE customer_orders SET order_status = ? WHERE id = ?');
    const info = stmt.run(status, id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, message: `Order status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track order by customer phone
app.get('/api/orders/track/:phone', (req, res) => {
  try {
    const { phone } = req.params;
    const orders = db.prepare(`
      SELECT * FROM customer_orders 
      WHERE customer_phone = ? 
      ORDER BY id DESC
    `).all(phone);

    const parsed = orders.map(o => {
      try {
        return { ...o, items: JSON.parse(o.items_json) };
      } catch (e) {
        return { ...o, items: [] };
      }
    });

    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 7. RATE CHART & LIVE CALCULATOR APIS
// ==========================================
app.get('/api/rates', (req, res) => {
  try {
    const rates = db.prepare('SELECT * FROM rate_chart').all();
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rates/calculate', (req, res) => {
  try {
    const { milk_type, fat, snf = 8.5, quantity = 1 } = req.body;
    const ratePerLiter = calculateMilkRate(milk_type, parseFloat(fat), parseFloat(snf));
    const totalAmount = Math.round(ratePerLiter * parseFloat(quantity) * 100) / 100;

    res.json({
      milk_type,
      fat: parseFloat(fat),
      snf: parseFloat(snf),
      quantity: parseFloat(quantity),
      rate_per_liter: ratePerLiter,
      total_amount: totalAmount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/rates', (req, res) => {
  try {
    const { milk_type, base_fat, base_snf, base_rate, fat_step_rate, snf_step_rate } = req.body;
    const stmt = db.prepare(`
      UPDATE rate_chart 
      SET base_fat = ?, base_snf = ?, base_rate = ?, fat_step_rate = ?, snf_step_rate = ?, updated_at = datetime('now', 'localtime')
      WHERE milk_type = ?
    `);

    stmt.run(
      parseFloat(base_fat),
      parseFloat(base_snf),
      parseFloat(base_rate),
      parseFloat(fat_step_rate),
      parseFloat(snf_step_rate),
      milk_type
    );

    res.json({ success: true, message: `Rate chart updated for ${milk_type} milk` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 8. DATA EXPORT (CSV)
// ==========================================
app.get('/api/export/collections-csv', (req, res) => {
  try {
    const collections = db.prepare(`
      SELECT 
        c.id,
        c.collection_date,
        c.shift,
        f.farmer_code,
        f.name as farmer_name,
        f.village as farmer_village,
        c.milk_type,
        c.quantity_liters,
        c.fat_percentage,
        c.snf_percentage,
        c.rate_per_liter,
        c.total_amount,
        c.payment_status
      FROM milk_collections c
      JOIN farmers f ON c.farmer_id = f.id
      ORDER BY c.collection_date DESC, c.id DESC
    `).all();

    let csv = 'ID,Date,Shift,Farmer Code,Farmer Name,Village,Milk Type,Liters,Fat %,SNF %,Rate/L,Total (INR),Payment Status\n';
    collections.forEach(r => {
      csv += `"${r.id}","${r.collection_date}","${r.shift}","${r.farmer_code}","${r.farmer_name}","${r.farmer_village}","${r.milk_type}",${r.quantity_liters},${r.fat_percentage},${r.snf_percentage},${r.rate_per_liter},${r.total_amount},"${r.payment_status}"\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`village_dairy_collections_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback to index.html for single-page routing (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🌾 Gaon Village Milk Dairy System is running!`);
  console.log(`🌐 Server & Frontend URL: http://localhost:${PORT}`);
  console.log(`📁 Database: ${path.join(__dirname, 'village_dairy.db')}`);
  console.log(`=======================================================`);
});
