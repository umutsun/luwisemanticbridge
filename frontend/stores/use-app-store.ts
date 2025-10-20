import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface Node {
  id: string
  name: string
  type: string
  status: 'active' | 'inactive' | 'error' | 'pending'
  lastUpdated: Date
  metadata?: Record<string, any>
}

interface AppState {
  nodes: Node[]
  selectedNode: Node | null
  searchQuery: string
  isConnected: boolean
  stats: {
    totalNodes: number
    activeNodes: number
    errorNodes: number
    processingRate: number
  }
  setNodes: (nodes: Node[]) => void
  addNode: (node: Node) => void
  updateNode: (id: string, updates: Partial<Node>) => void
  removeNode: (id: string) => void
  selectNode: (node: Node | null) => void
  setSearchQuery: (query: string) => void
  setConnectionStatus: (status: boolean) => void
  updateStats: (stats: Partial<AppState['stats']>) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        nodes: [],
        selectedNode: null,
        searchQuery: '',
        isConnected: false,
        stats: {
          totalNodes: 0,
          activeNodes: 0,
          errorNodes: 0,
          processingRate: 0,
        },
        setNodes: (nodes) => set({ nodes }),
        addNode: (node) => set((state) => ({ 
          nodes: [...state.nodes, node] 
        })),
        updateNode: (id, updates) => set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, ...updates } : node
          ),
        })),
        removeNode: (id) => set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== id),
        })),
        selectNode: (node) => set({ selectedNode: node }),
        setSearchQuery: (query) => set({ searchQuery: query }),
        setConnectionStatus: (status) => set({ isConnected: status }),
        updateStats: (stats) => set((state) => ({ 
          stats: { ...state.stats, ...stats } 
        })),
      }),
      {
        name: 'app-store',
      }
    )
  )
)