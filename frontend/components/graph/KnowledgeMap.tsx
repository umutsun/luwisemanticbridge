"use client"

import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface KnowledgeNode {
    id: string
    label: string
    category: string
    importance: number
    x?: number
    y?: number
    connections: string[]
}

interface KnowledgeLink {
    source: string
    target: string
    strength: number
    type?: string
}

interface KnowledgeMapProps {
    nodes: KnowledgeNode[]
    links: KnowledgeLink[]
    width?: number
    height?: number
    onNodeClick?: (node: KnowledgeNode) => void
}

export function KnowledgeMap({
    nodes,
    links,
    width = 800,
    height = 600,
    onNodeClick
}: KnowledgeMapProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null)

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

        // Create color scale for categories
        const colorScale = d3.scaleOrdinal<string>()
            .domain(['concept', 'entity', 'relation', 'process'])
            .range(['#6366F1', '#8B5CF6', '#10B981', '#F59E0B'])

        // Create simulation
        const simulation = d3.forceSimulation(nodes as any)
            .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
            .force("charge", d3.forceManyBody().strength(-500))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(40))

        // Create links
        const link = container.append("g")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke", "#94a3b8")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", (d: any) => Math.sqrt(d.strength) * 2)

        // Add arrows for directed links
        const arrowMarker = svg.append("defs")
            .selectAll("marker")
            .data(['arrow'])
            .join("marker")
            .attr("id", 'arrow')
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 25)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#94a3b8")

        link.attr("marker-end", "url(#arrow)")

        // Create nodes
        const node = container.append("g")
            .selectAll("g")
            .data(nodes)
            .join("g")
            .style("cursor", "pointer")

        // Add circles for nodes
        node.append("circle")
            .attr("r", (d: any) => Math.sqrt(d.importance) * 8 + 10)
            .attr("fill", (d: any) => colorScale(d.category))
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)

        // Add labels
        node.append("text")
            .text((d: any) => d.label)
            .attr("font-size", 12)
            .attr("font-family", "sans-serif")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .attr("fill", "#fff")
            .attr("pointer-events", "none")

        // Update positions on tick
        simulation.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y)

            node.attr("transform", (d: any) => `translate(${d.x},${d.y})`)
        })

        // Add click handlers
        node.on("click", (event, d) => {
            setSelectedNode(d)
            onNodeClick?.(d)
        })

        // Cleanup
        return () => {
            simulation.stop()
        }
    }, [nodes, links, width, height, onNodeClick])

    return (
        <div className="w-full h-full relative">
            <svg
                ref={svgRef}
                width={width}
                height={height}
                className="border rounded-lg bg-background"
            />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm p-3 rounded-lg border">
                <div className="text-xs font-medium mb-2">Categories</div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#6366F1]"></div>
                        <span className="text-xs">Concept</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
                        <span className="text-xs">Entity</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#10B981]"></div>
                        <span className="text-xs">Relation</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#F59E0B]"></div>
                        <span className="text-xs">Process</span>
                    </div>
                </div>
            </div>

            {/* Node Details */}
            {selectedNode && (
                <Card className="absolute top-4 right-4 w-64 z-10">
                    <CardHeader>
                        <CardTitle className="text-sm">{selectedNode.label}</CardTitle>
                        <CardDescription>Category: {selectedNode.category}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs space-y-1">
                            <div>ID: {selectedNode.id}</div>
                            <div>Importance: {selectedNode.importance.toFixed(2)}</div>
                            <div>Connections: {selectedNode.connections.length}</div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}