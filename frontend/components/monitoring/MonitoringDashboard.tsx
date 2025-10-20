"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MetricsDashboard } from '@/components/analytics/MetricsDashboard'
import { PerformanceChart } from '@/components/analytics/PerformanceChart'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts'
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    Clock,
    Cpu,
    HardDrive,
    MemoryStick,
    Server,
    Wifi,
    Zap
} from 'lucide-react'

interface SystemMetrics {
    timestamp: string
    cpu: number
    memory: number
    disk: number
    network: number
}

interface ServiceStatus {
    name: string
    status: 'healthy' | 'warning' | 'error'
    uptime: string
    lastCheck: string
    responseTime?: number
}

interface Alert {
    id: string
    type: 'info' | 'warning' | 'error' | 'success'
    title: string
    message: string
    timestamp: string
    acknowledged: boolean
}

interface MonitoringDashboardProps {
    autoRefresh?: boolean
    refreshInterval?: number
}

export function MonitoringDashboard({
    autoRefresh = true,
    refreshInterval = 5000
}: MonitoringDashboardProps) {
    const [systemMetrics, setSystemMetrics] = useState<SystemMetrics[]>([])
    const [serviceStatus, setServiceStatus] = useState<ServiceStatus[]>([])
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [loading, setLoading] = useState(true)

    // Mock data generation
    const generateMockMetrics = () => {
        const now = new Date()
        const newMetrics: SystemMetrics = {
            timestamp: now.toISOString(),
            cpu: Math.random() * 100,
            memory: Math.random() * 100,
            disk: Math.random() * 100,
            network: Math.random() * 100
        }

        setSystemMetrics(prev => {
            const updated = [...prev, newMetrics]
            return updated.slice(-20) // Keep last 20 data points
        })
    }

    const generateMockServices = () => {
        const services: ServiceStatus[] = [
            {
                name: 'API Gateway',
                status: Math.random() > 0.9 ? 'error' : Math.random() > 0.8 ? 'warning' : 'healthy',
                uptime: '99.9%',
                lastCheck: new Date().toISOString(),
                responseTime: Math.random() * 200 + 50
            },
            {
                name: 'Database',
                status: Math.random() > 0.9 ? 'error' : Math.random() > 0.8 ? 'warning' : 'healthy',
                uptime: '99.5%',
                lastCheck: new Date().toISOString(),
                responseTime: Math.random() * 100 + 20
            },
            {
                name: 'Cache',
                status: Math.random() > 0.9 ? 'error' : Math.random() > 0.8 ? 'warning' : 'healthy',
                uptime: '99.8%',
                lastCheck: new Date().toISOString(),
                responseTime: Math.random() * 50 + 5
            },
            {
                name: 'Message Queue',
                status: Math.random() > 0.9 ? 'error' : Math.random() > 0.8 ? 'warning' : 'healthy',
                uptime: '99.7%',
                lastCheck: new Date().toISOString(),
                responseTime: Math.random() * 30 + 10
            }
        ]
        setServiceStatus(services)
    }

    const generateMockAlerts = () => {
        const newAlert: Alert = {
            id: `alert-${Date.now()}`,
            type: Math.random() > 0.7 ? 'error' : Math.random() > 0.5 ? 'warning' : 'info',
            title: 'System Alert',
            message: 'This is a mock alert for demonstration purposes',
            timestamp: new Date().toISOString(),
            acknowledged: false
        }

        setAlerts(prev => [newAlert, ...prev.slice(0, 9)]) // Keep last 10 alerts
    }

    const fetchData = () => {
        setLoading(true)
        generateMockMetrics()
        generateMockServices()

        if (Math.random() > 0.7) {
            generateMockAlerts()
        }

        setTimeout(() => setLoading(false), 500)
    }

    useEffect(() => {
        fetchData()

        if (autoRefresh) {
            const interval = setInterval(fetchData, refreshInterval)
            return () => clearInterval(interval)
        }
    }, [autoRefresh, refreshInterval])

    const getStatusColor = (status: 'healthy' | 'warning' | 'error') => {
        switch (status) {
            case 'healthy': return 'text-green-500'
            case 'warning': return 'text-yellow-500'
            case 'error': return 'text-red-500'
        }
    }

    const getStatusIcon = (status: 'healthy' | 'warning' | 'error') => {
        switch (status) {
            case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />
            case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
            case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />
        }
    }

    const getAlertTypeColor = (type: Alert['type']) => {
        switch (type) {
            case 'info': return 'bg-blue-50 border-blue-200 text-blue-800'
            case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800'
            case 'error': return 'bg-red-50 border-red-200 text-red-800'
            case 'success': return 'bg-green-50 border-green-200 text-green-800'
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">System Monitoring</h1>
                    <p className="text-muted-foreground">Real-time system metrics and service status</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${loading ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                    <span className="text-sm text-muted-foreground">
                        {loading ? 'Updating...' : 'Live'}
                    </span>
                    <Button variant="outline" size="sm" onClick={fetchData}>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Service Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        Service Status
                    </CardTitle>
                    <CardDescription>Current status of all services</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {serviceStatus.map((service) => (
                            <Card key={service.name} className="border-l-4">
                                <div className={`border-l- ${service.status === 'healthy' ? 'border-l-green-500' :
                                    service.status === 'warning' ? 'border-l-yellow-500' :
                                        'border-l-red-500'
                                    }`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium">{service.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {getStatusIcon(service.status)}
                                                    <span className={`text-sm ${getStatusColor(service.status)}`}>
                                                        {service.status}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-muted-foreground">Uptime</div>
                                                <div className="font-medium">{service.uptime}</div>
                                                {service.responseTime && (
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        {service.responseTime.toFixed(0)}ms
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </div>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* System Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cpu className="h-5 w-5" />
                            CPU Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            <MetricsDashboard
                                title="CPU Usage"
                                data={systemMetrics.map(m => ({
                                    timestamp: m.timestamp,
                                    value: m.cpu
                                }))}
                                loading={loading}
                                type="line"
                                color="#EF4444"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MemoryStick className="h-5 w-5" />
                            Memory Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            <MetricsDashboard
                                title="Memory Usage"
                                data={systemMetrics.map(m => ({
                                    timestamp: m.timestamp,
                                    value: m.memory
                                }))}
                                loading={loading}
                                type="area"
                                color="#8B5CF6"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Alerts */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Recent Alerts
                    </CardTitle>
                    <CardDescription>System alerts and notifications</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {alerts.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No recent alerts
                            </div>
                        ) : (
                            alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className={`p-3 rounded-lg border ${getAlertTypeColor(alert.type)}`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="font-medium">{alert.title}</div>
                                            <div className="text-sm mt-1">{alert.message}</div>
                                            <div className="text-xs mt-2 text-muted-foreground">
                                                {new Date(alert.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                        {!alert.acknowledged && (
                                            <Button variant="ghost" size="sm" className="ml-2">
                                                Acknowledge
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Performance Overview */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Performance Overview
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-80">
                        <PerformanceChart
                            title="System Performance"
                            data={systemMetrics.map(m => ({
                                timestamp: m.timestamp,
                                cpuUsage: m.cpu,
                                memoryUsage: m.memory,
                                responseTime: Math.random() * 100 + 50,
                                throughput: Math.random() * 1000 + 500,
                                errorRate: Math.random() * 5
                            }))}
                            loading={loading}
                            showMetrics={['cpuUsage', 'memoryUsage']}
                            height={320}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}