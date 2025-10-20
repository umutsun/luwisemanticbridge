"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { useAppStore } from "@/stores/use-app-store"
import { cn } from "@/lib/utils"

export function SearchCommand() {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")
  const { setSearchQuery } = useAppStore()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    setSearchQuery(e.target.value)
  }

  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search nodes... (⌘K)"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-sm shadow-sm transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        value={value}
        onChange={handleSearch}
      />
    </div>
  )
}