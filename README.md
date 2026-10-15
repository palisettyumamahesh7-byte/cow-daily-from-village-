# Village Green Dairy - Village Milk Dairy Management System

A full-stack, responsive web application designed specifically for **Village Milk Dairy Centers & Rural Dairy Farms**. It integrates **Daily Milk Collection & Fat Testing** for village farmers, **Automated Rate Calculation**, **Instant Thermal Slip Printing**, and a **Fresh Village Dairy Storefront** for daily door-to-door milk subscriptions and customer orders.

---

## Key Features

### 1. Fresh Village Dairy Storefront
- **Product Catalog**: Pure Desi Gir Cow Milk (A2), Rich Cream Buffalo Milk, Traditional Bilona Pure Ghee, Fresh Village Malai Paneer, Clay Pot Curd (Dahi), and Farm Fresh White Butter.
- **Interactive Shopping Cart**: Quantity adjustment, real-time total bill calculation, and persistent storage.
- **Daily Milk Subscription & Home Delivery**: Customers can book daily morning or evening fresh milk deliveries directly to their village address.
- **Order Tracking**: Customers can check the live delivery status of their orders using their phone number.

### 2. Daily Milk Collection Desk
- **Shift Selection**: Morning / Evening shift toggles.
- **Dynamic Farmer Dropdown**: Select village farmers by Farmer Code (`F-101`) or name.
- **Milk Type & Fat/SNF Testing**: Real-time rate calculation based on Milk Type (Cow/Buffalo), Liters, Fat %, and SNF %.
- **Live Rate Formula**: Calculates exact per-liter rate and total payable amount instantly.
- **Instant Thermal Milk Slip**: Generates and prints realistic thermal dairy slips with complete metrics, farmer information, and QR layout for physical printers (`Ctrl + P`).
- **Payment Status Toggle**: One-click toggle between **Paid** (Cash Settlement) and **Unpaid** (Ledger Account Balance).

### 3. Farmers Directory & Ledger
- **Farmer Profiles**: Name, village location, contact phone, cattle count & type, and bank account / UPI ID for direct payouts.
- **Registration**: Add new village farmers with auto-generated unique codes (`F-106`, etc.).
- **Live Ledger**: Complete historical supply statements showing every past delivery, total liters supplied, lifetime earnings, and pending balance.

### 4. Customer Orders & Deliveries
- View orders placed through the website.
- Filter by status: *Pending*, *Confirmed*, *Out for Delivery*, *Delivered*, *Cancelled*.
- Update delivery statuses with real-time updates.

### 5. Reports & Analytics
- Daily collection summaries (Morning vs Evening shift liters, Cow vs Buffalo ratio).
- Real-time quality index (average Fat %).
- **1-Click CSV Export**: Download the complete milk collection log directly to Microsoft Excel or Google Sheets.

### 6. Rate Chart & Formula Settings
- Transparent standard pricing formula:
  $$\text{Rate} = \text{Base Rate} + (\text{Fat} - \text{Base Fat}) \times 10 \times \text{Fat Step} + (\text{SNF} - \text{Base SNF}) \times 10 \times \text{SNF Step}$$
- Custom configuration for both Cow and Buffalo milk.
- Interactive Live Rate Calculator tool.

---

## Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│                   FRONTEND (UI)                        │
│   HTML5 + CSS3 + Vanilla ES6 JS + FontAwesome Icons    │
│   (Store, Daily Collection Desk, Farmer Ledger, etc.)  │
└───────────────────────────▲────────────────────────────┘
                            │ REST APIs (Fetch / JSON)
┌───────────────────────────▼────────────────────────────┐
│                  BACKEND (SERVER)                      │
│   Node.js (v24) + Express.js                           │
│   (REST APIs, CORS, Calculation Logic, CSV Exporter)   │
└───────────────────────────▲────────────────────────────┘
                            │ SQL Queries & Transactions
┌───────────────────────────▼────────────────────────────┐
│                 DATABASE (STORAGE)                     │
│   SQLite (node:sqlite DatabaseSync)                    │
│   (village_dairy.db - Farmers, Collections, Orders)    │
└────────────────────────────────────────────────────────┘
```

- **Frontend**: Responsive Single-Page Application (HTML5, Custom CSS, Vanilla JavaScript, FontAwesome).
- **Backend**: Node.js with Express.js REST API.
- **Database**: Embedded SQLite using Node.js v24 native `node:sqlite` (`village_dairy.db`). No external database servers or compilation required.

---

## Quick Start Guide

### 1. Prerequisites
- **Node.js** (v18, v20, v22, or v24)
- **npm** (included with Node.js)

### 2. Start the Server
Run the following command in the project directory:

```bash
npm start
```
Or for live reload during development:
```bash
npm run dev
```

### 3. Open in Browser
Open your browser and navigate to:
```
http://localhost:5000
```

---

## REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & village dairy profile settings |
| `GET` | `/api/dashboard` | Today's liters, morning/evening stats, cattle distribution |
| `GET` | `/api/collections` | Filter milk entries by date, shift, or farmer |
| `POST` | `/api/collections` | Record new daily milk entry & auto-calculate rate |
| `PATCH` | `/api/collections/:id/payment`| Toggle payment status (Paid / Unpaid) |
| `DELETE`| `/api/collections/:id` | Delete a milk collection entry |
| `GET` | `/api/farmers` | List all registered farmers with balances |
| `POST` | `/api/farmers` | Register a new village farmer |
| `GET` | `/api/farmers/:id` | Get farmer profile and complete historical supply ledger |
| `GET` | `/api/products` | Get fresh dairy products for the store |
| `GET` | `/api/orders` | Get all customer delivery orders |
| `POST` | `/api/orders` | Place a customer order or milk subscription |
| `PATCH` | `/api/orders/:id/status` | Update customer order status |
| `GET` | `/api/orders/track/:phone`| Track orders by customer phone number |
| `GET` | `/api/rates` | Get pricing formula configuration |
| `PUT` | `/api/rates` | Update rate chart parameters |
| `GET` | `/api/export/collections-csv`| Download collection log as CSV file |

---

## Project Directory Structure

```
├── package.json          # Dependencies & scripts
├── database.js            # SQLite schema, tables, formula & seeder (English)
├── server.js              # Express REST API & static file server
├── village_dairy.db       # Persistent SQLite database file
├── public/                # Frontend application
│   ├── index.html         # Main dashboard, store, and collection desk UI (English)
│   ├── css/
│   │   └── styles.css     # Responsive theme, print styles & layout
│   └── js/
│       └── app.js         # Frontend controller, calculations, cart & modals (English)
└── README.md              # Project documentation
```
