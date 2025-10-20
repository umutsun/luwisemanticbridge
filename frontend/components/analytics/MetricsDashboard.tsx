"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

interface MetricData {
    timestamp: string
    value: number
    label?: string
}

interface MetricsDashboardProps {
    title: string
    description?: string
    data: MetricData[]
    loading?: boolean
    type?: 'line' | 'area' | 'bar' | 'pie'
    color?: string
    height?: number
}

export function MetricsDashboard({
    title,
    description,
    data,
    loading = false,
    type = 'line',
    color = '#6366F1',
    height = 300
}: MetricsDashboardProps) {
    const [chartData, setChartData] = useState<MetricData[]>([])

    useEffect(() => {
        if (data && data.length > 0) {
            setChartData(data)
        }
    }, [data])

    const renderChart = () => {
        if (loading) {
            return <div className="w-full h-full flex items-center justify-center"><Skeleton className="w-full h-full" /></div>
        }

        switch (type) {
            case 'area':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="timestamp"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                            />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip
                                labelFormatter={(value) => new Date(value).toLocaleString()}
                                formatter={(value: number) => [value.toFixed(2), title]}
                            />
                            <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.3} />
                        </AreaChart>
                    </ResponsiveContainer>
                )
            case 'bar':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="timestamp"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                            />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip
                                labelFormatter={(value) => new Date(value).toLocaleString()}
                                formatter={(value: number) => [value.toFixed(2), title]}
                            />
                            <Bar dataKey="value" fill={color} />
                        </BarChart>
                    </ResponsiveContainer>
                )
            case 'pie':
                const pieData = chartData.map((item, index) => ({
                    name: item.label || `Data ${index + 1}`,
                    value: item.value,
                    fill: `hsl(${(index * 137.5) % 360}, 70%, 50%)`
                }))
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [value.toFixed(2), title]} />
                        </PieChart>
                    </ResponsiveContainer>
                )
            default:
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="timestamp"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                            />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip
                                labelFormatter={(value) => new Date(value).toLocaleString()}
                                formatter={(value: number) => [value.toFixed(2), title]}
                            />
                            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                )
        }
    }

    const calculateStats = () => {
        if (loading || chartData.length === 0) {
            return { current: 0, min: 0, max: 0, avg: 0 }
        }

        const values = chartData.map(d => d.value)
        const current = values[values.length - 1]
        const min = Math.min(...values)
        const max = Math.max(...values)
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length

        return { current, min, max, avg }
    }

    const stats = calculateStats()

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Current</div>
                        <div className="text-lg font-semibold">
                            {loading ? <Skeleton className="h-4 w-16" /> : stats.current.toFixed(2)}
                        </div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Average</div>
                        <div className="text-lg font-semibold">
                            {loading ? <Skeleton className="h-4 w-16" /> : stats.avg.toFixed(2)}
                        </div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Min</div>
                        <div className="text-lg font-semibold">
                            {loading ? <Skeleton className="h-4 w-16" /> : stats.min.toFixed(2)}
                        </div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Max</div>
                        <div className="text-lg font-semibold">
                            {loading ? <Skeleton className="h-4 w-16" /> : stats.max.toFixed(2)}
                        </div>
                    </div>
                </div>
                <div className="h-[300px]">
                    {renderChart()}
                </div>
            </CardContent>
        </Card>
    )
}