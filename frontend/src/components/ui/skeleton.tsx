import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

// Card Skeleton
export function CardSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <Skeleton className="h-5 w-1/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

// Table Skeleton (for use outside table elements)
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex gap-4 pb-3 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Table Body Skeleton (for use inside tbody elements)
export function TableBodySkeleton({ rows = 5, columns = 7 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="animate-pulse">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="px-3 py-4 border-b">
              <div className="h-3 bg-muted rounded" style={{ width: `${Math.random() * 40 + 60}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// List Skeleton
export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Form Skeleton
export function FormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-1/3" />
    </div>
  )
}

// Stats Card Skeleton
export function StatsCardSkeleton() {
  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-10 w-3/4 mt-4" />
      <Skeleton className="h-2 w-full mt-2" />
    </div>
  )
}

// Chart Skeleton
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-1/4" />
      <div className="relative" style={{ height: `${height}px` }}>
        <Skeleton className="absolute inset-0 rounded-lg" />
        {/* Simulate chart bars */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around h-full p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="w-8"
              style={{ height: `${Math.random() * 70 + 20}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Embeddings Manager Skeleton
export function EmbeddingsManagerSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left Column - Controls */}
      <div className="lg:col-span-2 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>

        {/* Control Panel */}
        <div className="rounded-lg border p-4 space-y-4">
          <Skeleton className="h-5 w-1/3" />
          <div className="space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-2 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-2 w-full" />
            </div>
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        {/* Tables List */}
        <div className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-1/4" />
          <ListSkeleton items={3} />
        </div>
      </div>

      {/* Right Column - Analytics */}
      <div className="lg:col-span-3 space-y-6">
        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </div>

        {/* Table Viewer */}
        <div className="rounded-lg border p-4">
          <Skeleton className="h-5 w-1/4 mb-4" />
          <TableSkeleton rows={8} columns={5} />
        </div>
      </div>
    </div>
  )
}

// Upload Area Skeleton
export function UploadSkeleton() {
  return (
    <div className="border-2 border-dashed border-muted rounded-lg p-6 space-y-4">
      <div className="flex flex-col items-center space-y-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2 w-24" />
        </div>
        <Skeleton className="h-8 w-full rounded" />
      </div>
    </div>
  )
}

export { Skeleton }