# ASB Dashboard - Luwi Semantic Bridge

Modern dashboard interface for Luwi Semantic Bridgewith real-time monitoring, node management, and analytics.

## Features

- **Modern UI/UX** with Next.js 14 App Router
- **Dark/Light Mode** toggle with system preference support
- **Real-time Updates** with Socket.io integration ready
- **Responsive Design** with Tailwind CSS
- **Component Library** using shadcn/ui
- **State Management** with Zustand
- **Data Caching** with React Query
- **Animated Charts** with Recharts
- **Search Interface** with keyboard shortcuts (⌘K)

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **UI Library:** Tailwind CSS + shadcn/ui
- **State Management:** Zustand
- **Data Fetching:** React Query (TanStack Query)
- **Charts:** Recharts
- **Icons:** Lucide Icons
- **Animations:** Framer Motion
- **Notifications:** Sonner

## Installation

1. Navigate to the dashboard directory:
```bash
cd asb-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
asb-dashboard/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main dashboard page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── theme-toggle.tsx  # Dark/light mode toggle
│   ├── search-command.tsx # Search interface
│   ├── node-status-card.tsx # Node cards
│   └── stats-chart.tsx   # Chart components
├── stores/               # Zustand stores
│   └── use-app-store.ts # Main application store
├── lib/                  # Utilities
│   └── utils.ts         # Helper functions
└── public/              # Static assets
```

## Key Components

### Dashboard Layout
- Sidebar navigation with sections: Overview, Nodes, Analytics
- Real-time connection status indicator
- Theme toggle for dark/light mode

### Node Management
- Visual status cards for each node
- Status indicators (Active, Inactive, Error, Pending)
- Quick actions (Refresh, Remove)

### Analytics Dashboard
- Real-time processing rate charts
- Node activity monitoring
- Error rate tracking
- Performance metrics visualization

### Search Interface
- Global search with keyboard shortcut (⌘K)
- Auto-complete functionality
- Real-time filtering

## Development

### Adding New Components

1. Create component in `components/` directory
2. Use Tailwind CSS classes for styling
3. Integrate with Zustand store for state management
4. Add to relevant page or layout

### Connecting to Backend

The dashboard is ready for backend integration. Update the following:

1. **API Configuration:** Create `/lib/api.ts` for API endpoints
2. **Socket.io:** Configure real-time connections in `/lib/socket.ts`
3. **React Query:** Set up queries in `/lib/queries/`

### Environment Variables

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## License

MIT