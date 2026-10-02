# Underchargers HR System — Full Runnable Package

## Login

- Username: `Jerome123`
- Password: `JJ123`

## Run in VS Code

1. Open this folder in VS Code.
2. Open **Terminal**.
3. Run:

```bash
npm install
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Mac shortcut

You can also run:

```bash
./start-mac.sh
```

If macOS blocks execution, run:

```bash
chmod +x start-mac.sh
./start-mac.sh
```

## Main source

The complete HR interface and functionality is in:

```text
public/hr.html
```

It includes:

- Login form
- Dashboard
- Employee records / archive / rehire
- Attendance with branch filtering and late-minute rules
- Leave requests with approve/reject
- Payroll and payslips
- Employee benefits and government deductions
- Loan deductions
- Commissions
- Schedules
- Documents and compliance
- Announcements
- HR reports
- Audit log
- Settings
- Automatic mirrored live camera preview

## Data storage

This runnable prototype uses browser `localStorage`, so the records are stored on the browser/device where you open it.

For production use, move login, HR records, payroll, documents, and audit logs to a backend/database such as Supabase.
