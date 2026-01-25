# Windows Task Scheduler Setup Guide

This guide shows how to schedule the Performance Analytics workers using Windows Task Scheduler.

## Command-Line Parameters

The `start-workers-xampp.bat` script now accepts command-line parameters:

- **Parameter `1`**: Start Metrics Queue Processor ONLY
- **Parameter `2`**: Start Server Link Checker ONLY  
- **Parameter `3`**: Start BOTH workers (staggered)

### Examples:
```batch
# Start Metrics Processor
start-workers-xampp.bat 1

# Start Server Checker
start-workers-xampp.bat 2

# Start Both
start-workers-xampp.bat 3
```

## Setting Up Windows Task Scheduler

### Option 1: Metrics Processor (Recommended for continuous operation)

1. **Open Task Scheduler**
   - Press `Win + R`, type `taskschd.msc`, press Enter

2. **Create Basic Task**
   - Click "Create Basic Task" in the right panel
   - Name: `Analytics Metrics Processor`
   - Description: `Process performance metrics queue`

3. **Trigger**
   - Select: "When the computer starts" (for continuous operation)
   - OR "Daily" at a specific time

4. **Action**
   - Select: "Start a program"
   - Program/script: `C:\xampp\htdocs\linknest\analytics\start-workers-xampp.bat`
   - Add arguments: `1`
   - Start in: `C:\xampp\htdocs\linknest`

5. **Advanced Settings** (after creation, right-click task → Properties)
   - General tab:
     - ☑ Run whether user is logged on or not
     - ☑ Run with highest privileges
   - Settings tab:
     - ☑ Allow task to be run on demand
     - ☑ If the task fails, restart every: 5 minutes
     - ☑ Stop the task if it runs longer than: 3 days (or unchecked for continuous)

### Option 2: Server Link Checker (Recommended for periodic checks)

1. **Create Basic Task**
   - Name: `Analytics Server Checker`
   - Description: `Check server link health and latency`

2. **Trigger**
   - Select: "Daily"
   - Start: 12:00 AM (or your preferred time)
   - Recur every: 1 day
   - **Advanced**: Repeat task every: 1 hour (or 30 minutes)
   - For a duration of: 1 day

3. **Action**
   - Program/script: `C:\xampp\htdocs\linknest\analytics\start-workers-xampp.bat`
   - Add arguments: `2`
   - Start in: `C:\xampp\htdocs\linknest`

4. **Advanced Settings**
   - Same as Option 1

### Option 3: Both Workers (Not Recommended - may conflict)

Only use if you understand the potential for location data conflicts.

- Program/script: `C:\xampp\htdocs\linknest\analytics\start-workers-xampp.bat`
- Add arguments: `3`

## Recommended Scheduling Strategy

### For Production Environments:

**Scenario A: Continuous Metrics Processing**
- Task 1: Metrics Processor - Start at system boot, run continuously
- Task 2: Server Checker - Run every 2 hours, stop after 5 minutes

**Scenario B: Separated Time Windows**
- Task 1: Metrics Processor - Run Monday-Friday, 8 AM - 6 PM
- Task 2: Server Checker - Run daily at 2 AM (off-hours)

## Monitoring Scheduled Tasks

### Check Task Status:
1. Open Task Scheduler
2. Find your task in "Task Scheduler Library"
3. View "Last Run Result" and "Last Run Time"

### View Worker Logs:
- Worker windows will appear when tasks run
- For background tasks, check: `C:\xampp\htdocs\linknest\analytics\logs\`

## Troubleshooting

### Task doesn't start:
- Verify XAMPP PHP path: `C:\xampp\php\php.exe`
- Check "Run with highest privileges" is enabled
- Verify user account has permissions

### Worker closes immediately:
- Run the batch file manually first to verify it works
- Check PostgreSQL is running: `net start postgresql-x64-14`
- Check error messages in worker window

### Workers conflict:
- Don't schedule both workers to run at the same time
- Use Option 1 OR Option 2, not both simultaneously
- If using Option 3, increase stagger time in the batch file

## Stopping Scheduled Workers

### Manually stop a running task:
1. Open Task Scheduler
2. Right-click the task
3. Select "End"

### Stop worker permanently:
1. Find the worker's command window
2. Press `Ctrl + C` or close the window
3. Or disable the task in Task Scheduler

## Example: Complete Setup (Recommended)

```plaintext
Task 1: Analytics Metrics Processor
├─ Trigger: At startup
├─ Action: start-workers-xampp.bat 1
├─ Settings: Run continuously, restart on failure
└─ Purpose: Process all client metrics in real-time

Task 2: Analytics Server Checker  
├─ Trigger: Daily at 2:00 AM, repeat every 6 hours
├─ Action: start-workers-xampp.bat 2
├─ Settings: Stop after 10 minutes, restart on failure
└─ Purpose: Periodic server health monitoring
```

## Notes

- The workers will run in visible command windows (by design)
- To run completely hidden, modify the batch file to use `start /min` or create a VBS wrapper
- Location data consistency is improved when workers don't run simultaneously
- Monitor PostgreSQL database size if running continuously

## Support

For issues or questions, check:
- Worker logs in analytics folder
- PostgreSQL logs
- Windows Event Viewer → Application logs
