"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, RefreshCw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface NodeStatusCardProps {
  node: {
    id: string
    name: string
    type: string
    status: 'active' | 'inactive' | 'error' | 'pending'
    lastUpdated: Date
    metadata?: Record<string, any>
  }
}

export function NodeStatusCard({ node }: NodeStatusCardProps) {
  const statusColors = {
    active: "bg-green-500",
    inactive: "bg-gray-500",
    error: "bg-red-500",
    pending: "bg-yellow-500"
  }

  const statusText = {
    active: "Active",
    inactive: "Inactive",
    error: "Error",
    pending: "Pending"
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={cn("h-2 w-2 rounded-full", statusColors[node.status])} />
            <CardTitle className="text-base">{node.name}</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>{node.type}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{statusText[node.status]}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last Updated</span>
            <span className="font-medium" suppressHydrationWarning>
              {node.lastUpdated.toLocaleTimeString('en-US', { hour12: false })}
            </span>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" className="flex-1">
              <RefreshCw className="mr-1 h-3 w-3" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              <Trash2 className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}