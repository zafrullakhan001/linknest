# LinkNest Docker Deployment Package

This is a self-contained Docker deployment package for LinkNest.

## Quick Start

1. Ensure Docker Desktop is installed and running
2. Run `deploy.bat` to build and start the container
3. Access the application at http://localhost:8090

## What's Included

- Complete LinkNest application source code
- Docker configuration files
- Database file (if available)
- Uploads folder with assets
- Automated deployment script

## Requirements

- Docker Desktop for Windows
- At least 2GB of free disk space
- Ports 8090 (HTTP), 8443 (HTTPS), 1025 (SMTP), 8025 (Mailpit UI) available

## Deployment

Simply run:
```
deploy.bat
```

The script will:
1. Check Docker installation
2. Build the Docker image
3. Start the containers
4. Open the application in your browser

## Container Management

- View logs: `docker compose logs -f`
- Stop: `docker compose stop`
- Start: `docker compose start`
- Restart: `docker compose restart`
- Remove: `docker compose down`

## Data Export

To export data from the container:
```
docker cp linknest:/var/www/html/data/linknest.db ./exported-database.db
docker cp linknest:/var/www/html/uploads ./exported-uploads
```

## Support

For issues or questions, please refer to the LinkNest documentation.
