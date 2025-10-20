"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    ComposedChart,
    Bar
} from 'recharts'

interface PerformanceMetric {
    timestamp: string
    responseTime: number
    throughput: number
    errorRate: number
    cpuUsage?: number
    memoryUsage?: number
}

interface PerformanceChartProps {
    title: string
    description?: string
    data: PerformanceMetric[]
    loading?: boolean
    showMetrics?: ('responseTime' | 'throughput' | 'errorRate' | 'cpuUsage' | 'memoryUsage')[]
    height?: number
}

export function PerformanceChart({
    title,
    description,
    data,
    loading = false,
    showMetrics = ['responseTime', 'throughput', 'errorRate'],
    height = 400
}: PerformanceChartProps) {
    const [chartData, setChartData] = useState<PerformanceMetric[]>([])

    useEffect(() => {
        if (data && data.length > 0) {
            setChartData(data)
        }
    }, [data])

    const formatYAxis = (metric: keyof PerformanceMetric) => {
        switch (metric) {
            case 'responseTime':
                return { label: 'Response Time (ms)', tickFormatter: (value: number) => `${value}ms` }
            case 'throughput':
                return { label: 'Throughput (req/s)', tickFormatter: (value: number) => `${value}` }
            case 'errorRate':
                return { label: 'Error Rate (%)', tickFormatter: (value: number) => `${value}%` }
            case 'cpuUsage':
                return { label: 'CPU Usage (%)', tickFormatter: (value: number) => `${value}%` }
            case 'memoryUsage':
                return { label: 'Memory Usage (%)', tickFormatter: (value: number) => `${value}%` }
            default:
                return { label: '', tickFormatter: (value: number) => value }
        }
    }

    const getMetricColor = (metric: keyof PerformanceMetric) => {
        switch (metric) {
            case 'responseTime':
                return '#EF4444'
            case 'throughput':
                return '#10B981'
            case 'errorRate':
                return '#F59E0B'
            case 'cpuUsage':
                return '#8B5CF6'
            case 'memoryUsage':
                return '#06B6D4'
            default:
                return '#6366F1'
        }
    }

    const renderChart = () => {
        if (loading) {
            return <div className="w-full h-full flex items-center justify-center"><Skeleton className="w-full h-full" /></div>
        }

        if (showMetrics.length === 1) {
            const metric = showMetrics[0]
            const { label, tickFormatter } = formatYAxis(metric)

            return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="timestamp"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                        />
                        <YAxis
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value: number) => tickFormatter(value).toString()}
                            label={{ value: label, angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip
                            labelFormatter={(value) => new Date(value).toLocaleString()}
                            formatter={(value: number, name: string) => [
                                tickFormatter(value),
                                name.charAt(0).toUpperCase() + name.slice(1)
                            ]}
                        />
                        <Line
                            type="monotone"
                            dataKey={metric}
                            stroke={getMetricColor(metric)}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            )
        }

        // Multiple metrics - use ComposedChart
        const lines = showMetrics.map((metric, index) => (
            <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={getMetricColor(metric)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
            />
        ))

        return (
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        dataKey="timestamp"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleString()}
                    />
                    {lines}
                </ComposedChart>
            </ResponsiveContainer>
        )
    }

    const calculateSummaryStats = () => {
        if (loading || chartData.length === 0) {
            return {}
        }

        const stats: Record<string, any> = {}

        showMetrics.forEach(metric => {
            const values = chartData.map(d => d[metric as keyof PerformanceMetric] as number)
            const current = values[values.length - 1]
            const avg = values.reduce((sum, val) => sum + val, 0) / values.length
            const max = Math.max(...values)
            const min = Math.min(...values)

            stats[metric] = {
                current,
                avg,
                max,
                min,
                trend: current > avg ? 'up' : current < avg ? 'down' : 'stable'
            }
        })

        return stats
    }

    const stats = calculateSummaryStats()

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                    {showMetrics.map(metric => (
                        <div key={metric} className="bg-muted/50 rounded-lg p-3">
                            <div className="text-xs text-muted-foreground capitalize">
                                {metric.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <div className="text-lg font-semibold">
                                {loading ? (
                                    <Skeleton className="h-4 w-16" />
                                ) : (
                                    typeof stats[metric]?.current === 'number'
                                        ? stats[metric]?.current.toFixed(2)
                                        : 'N/A'
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Avg: {loading ? (
                                    <Skeleton className="h-3 w-12" />
                                ) : (
                                    typeof stats[metric]?.avg === 'number'
                                        ? stats[metric]?.avg.toFixed(2)
                                        : 'N/A'
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Chart */}
                <div className="h-[400px]">
                    {renderChart()}
                </div>
            </CardContent>
        </Card>
    )
}