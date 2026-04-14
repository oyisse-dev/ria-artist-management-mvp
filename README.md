# Music Management System

A full-stack music management system built with React, Node.js, Express, and PostgreSQL.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (via Docker)
- **Authentication**: JWT

## Core Features

- User registration & login (JWT, role-based: admin / regular user)
- CRUD for artists, albums, songs (admin only for write operations)
- Playlists: create playlists, add/remove songs, public/private visibility
- Search songs by title, artist, genre
- User dashboard with stats
- Admin dashboard for user management and system stats
- Image upload for artist photos and album covers
- Audio preview player (HTML5)
- Pagination, responsive design, dark mode (optional)

## Project Structure

```
music-management-system/
├── backend/          # Express.js backend
├── frontend/         # React + Vite frontend
├── infra/            # Infrastructure (Docker, database)
│   ├── docker-compose.yml
│   ├── init.sql
│   └── .env
└── docs/             # Documentation
```

## Phase 1: Quick Start (Database Setup)

### Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ (for later phases)

### Setup Database

1. **Navigate to the infra directory**:
   ```bash
   cd infra
   ```

2. **Start the database containers**:
   ```bash
   docker-compose up -d
   ```

3. **Verify the database is running**:
   ```bash
   docker-compose ps
   ```
   
   You should see both `music_mgmt_db` and `music_mgmt_pgadmin` containers running.

4. **Check database logs**:
   ```bash
   docker-compose logs postgres
   ```
   
   Look for: `database system is ready to accept connections`

5. **Access pgAdmin** (database management UI):
   - Open browser: http://localhost:8080
   - Email: `admin@musicmgmt.local`
   - Password: `adminpass123`

6. **Connect to the database in pgAdmin**:
   - The server should auto-appear in the sidebar
   - Click to connect (password: `musicpass123`)
   - Expand **Databases** → **music_management** → **Schemas** → **public** → **Tables**
   - You should see all 6 tables: `users`, `artists`, `albums`, `songs`, `playlists`, `playlist_songs`

### Test Database Connection

```bash
# Connect to the PostgreSQL container
docker exec -it music_mgmt_db psql -U musicadmin -d music_management

# Run a test query
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

# Exit
\q
```

### Stop the Database

```bash
docker-compose down
```

### Stop and Remove All Data

```bash
docker-compose down -v
```

## Default Credentials

### Database
- **User**: `musicadmin`
- **Password**: `musicpass123`
- **Database**: `music_management`
- **Port**: `5432`

### pgAdmin
- **Email**: `admin@musicmgmt.local`
- **Password**: `adminpass123`
- **Port**: `8080`

### Default Admin User (in database)
- **Email**: `admin@musicmgmt.local`
- **Password**: `admin123` (change in production!)

## Next Phases

- **Phase 2**: Backend setup (Express server, models, auth, CRUD routes)
- **Phase 3**: Frontend setup (React + Vite + Tailwind, routing, auth UI)
- **Phase 4**: Feature implementation (Artists, Albums, Songs, Playlists, Dashboards)
- **Phase 5**: Advanced features (image upload, audio player, pagination, dark mode)
- **Phase 6**: Testing & deployment

## License

MIT
