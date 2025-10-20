"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts"

const data = [
  { time: "00:00", value: 400, nodes: 18 },
  { time: "04:00", value: 300, nodes: 17 },
  { time: "08:00", value: 600, nodes: 20 },
  { time: "12:00", value: 800, nodes: 22 },
  { time: "16:00", value: 1200, nodes: 24 },
  { time: "20:00", value: 900, nodes: 23 },
  { time: "24:00", value: 700, nodes: 21 },
]

export function StatsChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Overview</CardTitle>
        <CardDescription>Requests processed over the last 24 hours</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="time" 
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#3b82f6" 
              fillOpacity={1} 
              fill="url(#colorValue)" 
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="nodes" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}