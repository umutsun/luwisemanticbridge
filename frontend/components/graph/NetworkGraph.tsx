"use client"

import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface NetworkNode {
    id: string
    name: string
    type: 'entity' | 'concept' | 'relation'
    value?: number
    x?: number
    y?: number
    fx?: number | null
    fy?: number | null
}

interface NetworkLink {
    source: string | NetworkNode
    target: string | NetworkNode
    value?: number
    type?: string
}

interface NetworkGraphProps {
    nodes: NetworkNode[]
    links: NetworkLink[]
    width?: number
    height?: number
    onNodeClick?: (node: NetworkNode) => void
    onLinkClick?: (link: NetworkLink) => void
}

export function NetworkGraph({
    nodes,
    links,
    width = 800,
    height = 600,
    onNodeClick,
    onLinkClick
}: NetworkGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null)

    useEffect(() => {
        if (!svgRef.current) return

        // Clear previous content
        d3.select(svgRef.current).selectAll("*").remove()

        const svg = d3.select(svgRef.current)
        const container = svg.append("g")

        // Zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                container.attr("transform", event.transform as any)
            })

        svg.call(zoom)

        // Prepare data - ensure proper typing for force simulation
        const simulation = d3.forceSimulation(nodes as any)
            .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(30))

        // Create links
        const link = container.append("g")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", (d: any) => Math.sqrt(d.value || 1))

        // Create nodes
        const node = container.append("g")
            .selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("r", (d: any) => Math.sqrt(d.value || 10) * 2)
            .attr("fill", (d: any) => {
                switch (d.type) {
                    case 'entity': return '#6366F1'
                    case 'concept': return '#8B5CF6'
                    case 'relation': return '#10B981'
                    default: return '#6B7280'
                }
            })
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .style("cursor", "pointer")

        // Add labels
        const label = container.append("g")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .text((d: any) => d.name)
            .attr("font-size", 12)
            .attr("font-family", "sans-serif")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .style("pointer-events", "none")

        // Update positions on tick
        simulation.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y)

            node
                .attr("cx", (d: any) => d.x)
                .attr("cy", (d: any) => d.y)

            label
                .attr("x", (d: any) => d.x)
                .attr("y", (d: any) => d.y)
        })

        // Add click handlers
        node.on("click", (event, d) => {
            setSelectedNode(d)
            onNodeClick?.(d)
        })

        link.on("click", (event, d) => {
            onLinkClick?.(d)
        })

        // Cleanup
        return () => {
            simulation.stop()
        }
    }, [nodes, links, width, height, onNodeClick, onLinkClick])

    return (
        <div className="w-full h-full">
            <svg
                ref={svgRef}
                width={width}
                height={height}
                className="border rounded-lg bg-background"
            />
            {selectedNode && (
                <Card className="absolute top-4 right-4 w-64 z-10">
                    <CardHeader>
                        <CardTitle className="text-sm">{selectedNode.name}</CardTitle>
                        <CardDescription>Type: {selectedNode.type}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs space-y-1">
                            <div>ID: {selectedNode.id}</div>
                            {selectedNode.value && <div>Value: {selectedNode.value}</div>}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}