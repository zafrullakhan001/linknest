# Demo Data Generation Scripts

This directory contains two demo data generation scripts for LinkNest. Both scripts create the same structure of tiles, links, and monitors but differ in their visual styling approach.

---

## 📁 Available Scripts

### 1. **generate_demo_data.php** (With Gradient Presets)

**Purpose:** Creates visually stunning demo data with 25 professional gradient presets.

**Features:**
- ✨ Beautiful multi-color gradients (3-color blends)
- 🎨 25 unique preset styles:
  - **Metallic:** Gold, Silver, Bronze, Chrome, Copper, Platinum, Rose Gold, Titanium
  - **Vibrant:** Ocean Blue, Sunset, Purple Dream, Orange Fire, Mint Fresh, Raspberry, Coral Reef, Emerald
  - **Soft/Pastel:** Cherry Blossom, Lavender, Sky Blue, Peachy, Amber Glow, Rose Pink
  - **Nature:** Forest, Teal Wave, Turquoise
  - **Dark/Bold:** Midnight, Navy, Deep Purple
- 📐 Custom gradient directions (90°, 135°, 180°)
- ✍️ Optimized text colors for readability
- 🎯 Rounded corners (16px border radius)
- 💾 Full gradient configurations stored in database

**Usage:**
```bash
php scripts/generate_demo_data.php
```

**Best For:**
- YouTube presentations and demos
- Showcasing the full visual capabilities of LinkNest
- Creating an impressive, colorful dashboard
- Professional demonstrations with wow-factor

**Also creates:** 10 roles, 10 demo users (demo1–demo10, password: `password`) with roles assigned.

---

### 2. **generate_demo_data_simple.php** (Simple/Clean)

**Purpose:** Creates clean demo data with solid colors and no gradient decorations.

**Features:**
- 🎯 Simple, clean tile appearance
- 🎨 Uses only theme_color (solid colors)
- 📊 Professional, minimalist aesthetic
- ⚡ Faster rendering (no gradient processing)
- 🧹 No decoration fields populated

**Usage:**
```bash
php scripts/generate_demo_data_simple.php
```

**Best For:**
- Clean, minimalist presentations
- Performance testing
- Corporate/enterprise environments preferring subtle styling
- Baseline testing without decorations
- Users who prefer simplicity

**Also creates:** 10 roles, 10 demo users (demo1–demo10, password: `password`) with roles assigned.

---

## 👥 Demo Roles and Users (Both PHP Scripts)

Both `generate_demo_data.php` and `generate_demo_data_simple.php` create:

- **10 roles:** Manager, Developer, Designer, Support, Viewer, Editor, HR, Finance, Guest, Auditor  
  (with short descriptions)

- **10 demo users:** `demo1` … `demo10`  
  - Emails: `demo1@demo.local` … `demo10@demo.local`  
  - **Password for all:** `password`  
  - All users are approved (`is_approved = 1`).  
  - Each user is assigned one role (demo1→Manager, demo2→Developer, … demo10→Auditor).

- **Role-based access (varied tiles; Public tab blocked):**  
  - Each role has a **different subset of tiles and links** (e.g. Manager: Main + Collaboration; Developer: Development + Infrastructure; Guest: minimal set).  
  - **All built-in widgets** are assigned to every role.  
  - **All tabs are allowed except Public:** Your Apps, Favorites, Private, Scheduled, Expired, Archive, Recycle bin, Monitoring, and Monitorv2 Dashboard.

Re-running either script will re-use existing demo users and roles, reset demo user passwords to `password`, reassign the roles, and re-apply tile/link/widget/tab permissions.

---

## 📊 Data Structure (Both Scripts)

Both scripts generate identical data structure:

### **Tiles: 25**
Organized into 5 categories (5 tiles each):
- **Main:** Company Dashboard, Analytics Hub, HR Portal, Finance Center, Customer Portal
- **Development:** Development Tools, Code Repositories, CI/CD Pipelines, Testing Platforms, API Management
- **Infrastructure:** Cloud Services, Server Management, Database Administration, Network Infrastructure, Security Center
- **Collaboration:** Communication Hub, Project Management, File Sharing, Collaborative Workspaces, Scheduling & Calendar
- **Resources:** Documentation Center, Training & Learning, Resource Library, Forms & Requests, IT Support

### **Links: 67**
Distributed across tiles with relevant URLs and descriptions

### **Monitors: 10**
Infrastructure monitoring examples:
- Main Website (URL)
- API Gateway (URL with keyword check)
- Database Server (port)
- Redis Cache (port)
- Email Server (ping)
- Staging Environment (URL)
- CDN Status (URL)
- Load Balancer (ping)
- Monitoring Dashboard (URL with keyword)
- Backup Server (port)

---

## 🔄 Switching Between Styles

You can easily switch between gradient and simple styles:

**To use gradients:**
```bash
php scripts/generate_demo_data.php
```

**To use simple (no gradients):**
```bash
php scripts/generate_demo_data_simple.php
```

Both scripts will:
1. ⚠️ Clear existing data (tiles, links, monitors, etc.)
2. ✅ Populate fresh demo data
3. 📊 Display summary statistics

---

## ⚠️ Important Notes

### Data Deletion Warning
Both scripts **DELETE ALL EXISTING DATA** including:
- All tiles
- All links
- All monitors
- All arrangements
- All permissions
- All related records

**Always backup your database before running these scripts!**

### Public Tiles
All generated tiles are marked as:
- `visibility = "public"`
- `user_id` = admin user ID (tiles are owned by the admin)
- Visible to all users automatically

### Arrangements
Global arrangements are created for all tiles, making them appear in the dashboard for all users.

---

## 🎨 Visual Comparison

### With Gradients (generate_demo_data.php)
```
┌─────────────────────────────────┐
│ 📊 Company Dashboard            │
│ ╔═══════════════════════════╗  │
│ ║ Ocean Blue Gradient       ║  │
│ ║ #0077BE → #00A8E8 → #005F8C │
│ ╚═══════════════════════════╝  │
└─────────────────────────────────┘
```

### Simple (generate_demo_data_simple.php)
```
┌─────────────────────────────────┐
│ 📊 Company Dashboard            │
│ ┌──────────────────────────────┐│
│ │ Solid Theme Color: #3B82F6  ││
│ └──────────────────────────────┘│
└─────────────────────────────────┘
```

---

## 🛠️ Technical Details

### Database Fields Populated

**generate_demo_data.php (with gradients):**
- `id`, `user_id`, `title`, `description`, `emoji`, `theme_color`
- `group`, `position`, `created_at`, `visibility`
- `tile_gradient_enabled` = 1
- `tile_gradient_colors` (JSON array)
- `tile_gradient_color_positions` (JSON array)
- `tile_gradient_direction` (degrees)
- `tile_gradient_type` = 'linear'
- `tile_text_color` (contrast-optimized)
- `tile_border_radius` = 16

**generate_demo_data_simple.php (no gradients):**
- `id`, `user_id`, `title`, `description`, `emoji`, `theme_color`
- `group`, `position`, `created_at`, `visibility`
- All gradient fields remain `NULL` (default)

---

## 📝 Customization

Both scripts can be customized by editing:
1. `$tiles` array - Add/modify tiles
2. Tab/section definitions - Change organizational structure
3. Link data - Update URLs and descriptions
4. Monitor configurations - Add/modify monitoring endpoints

For gradient presets, edit `$decorationPresets` array in `generate_demo_data.php`.

---

## 🎯 Recommendation

- **For demos & presentations:** Use `generate_demo_data.php` (with gradients)
- **For testing & development:** Use `generate_demo_data_simple.php` (simple)
- **For production seeding:** Modify either script to match your organization's data

### Demo logins (after running either PHP script)
- **Admin:** Use your existing admin user (e.g. admin / admin123 if default).
- **Demo users:** demo1 … demo10 with password **password** (e.g. demo1@demo.local / password).

---

## 📞 Support

If you encounter any issues:
1. Check database permissions
2. Verify PHP version (8.0+)
3. Ensure SQLite database is writable
4. Check PHP error logs

Both scripts include error handling and will display helpful error messages if something goes wrong.
