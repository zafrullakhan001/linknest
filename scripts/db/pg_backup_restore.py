import os
import subprocess
import argparse
import sys
from datetime import datetime

def check_tools():
    """Check if pg_dumpall and psql are available in the PATH or pgAdmin 4 runtime."""
    pg_admin_path = r"C:\Program Files\pgAdmin 4\runtime"
    tools = ["pg_dumpall", "psql"]
    
    # Check if tools are in PATH
    for tool in tools:
        try:
            subprocess.run([tool, "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError:
            # Not in PATH, check pgAdmin 4 runtime
            tool_path = os.path.join(pg_admin_path, tool + ".exe")
            if os.path.exists(tool_path):
                # Add pgAdmin path to environment PATH
                if pg_admin_path not in os.environ['PATH']:
                    os.environ['PATH'] = pg_admin_path + os.pathsep + os.environ['PATH']
                continue
            
            print(f"Error: PostgreSQL tool '{tool}' not found in PATH or in '{pg_admin_path}'.")
            print("Please ensure PostgreSQL tools are installed correctly.")
            sys.exit(1)

def run_backup(host, port, user, password, backup_file):
    print("-" * 40)
    print(f"🚀 Starting PostgreSQL FULL Backup")
    print(f"Target: {backup_file}")
    print(f"User:   {user}")
    print(f"Host:   {host}:{port}")
    print("-" * 40)

    os.environ['PGPASSWORD'] = password
    try:
        # --clean --if-exists adds drop statements to the dump
        cmd = [
            'pg_dumpall',
            '-h', host,
            '-p', str(port),
            '-U', user,
            '--file=' + backup_file,
            '--clean',
            '--if-exists'
        ]
        result = subprocess.run(cmd)
        
        if result.returncode == 0:
            print(f"✅ Backup completed successfully: {backup_file}")
        else:
            print(f"❌ Backup failed with exit code {result.returncode}")
            
    except Exception as e:
        print(f"🛑 Error during backup: {e}")
    finally:
        if 'PGPASSWORD' in os.environ:
            del os.environ['PGPASSWORD']

def run_restore(host, port, user, password, backup_file):
    if not os.path.exists(backup_file):
        print(f"Error: Backup file not found: {backup_file}")
        sys.exit(1)

    print("-" * 40)
    print(f"⚠️  Starting PostgreSQL FULL Restore")
    print(f"Source: {backup_file}")
    print(f"User:   {user}")
    print(f"Host:   {host}:{port}")
    print("-" * 40)
    print("WARNING: This will overwrite/modify existing databases!")

    os.environ['PGPASSWORD'] = password
    try:
        # Note: we connect to the 'postgres' database to perform the restore
        cmd = [
            'psql',
            '-h', host,
            '-p', str(port),
            '-U', user,
            '-f', backup_file,
            'postgres'
        ]
        result = subprocess.run(cmd)
        
        if result.returncode == 0:
            print(f"✅ Restore completed successfully!")
        else:
            print(f"❌ Restore failed with exit code {result.returncode}")
            
    except Exception as e:
        print(f"🛑 Error during restore: {e}")
    finally:
        if 'PGPASSWORD' in os.environ:
            del os.environ['PGPASSWORD']

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PostgreSQL Full Backup and Restore Script")
    parser.add_argument("action", choices=["backup", "restore"], help="Action to perform")
    parser.add_argument("--host", default="localhost", help="PostgreSQL host (default: localhost)")
    parser.add_argument("--port", default="5432", help="PostgreSQL port (default: 5432)")
    parser.add_argument("--user", required=True, help="PostgreSQL username")
    parser.add_argument("--password", required=True, help="PostgreSQL password")
    parser.add_argument("--file", default="all_databases_backup.sql", help="Backup file path")

    args = parser.parse_args()

    check_tools()

    if args.action == "backup":
        run_backup(args.host, args.port, args.user, args.password, args.file)
    elif args.action == "restore":
        run_restore(args.host, args.port, args.user, args.password, args.file)
