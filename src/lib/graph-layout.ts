import dagre from '@dagrejs/dagre';

export interface GraphNode {
	id: string;
	width: number;
	height: number;
}

export interface GraphEdge {
	source: string;
	target: string;
}

export interface NodePosition {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface EdgeLayout {
	source: string;
	target: string;
	points: { x: number; y: number }[];
}

export interface LayoutResult {
	nodes: Map<string, NodePosition>;
	edges: EdgeLayout[];
	width: number;
	height: number;
}

export interface LayoutOptions {
	rankdir?: 'TB' | 'LR' | 'BT' | 'RL';
	nodesep?: number;
	ranksep?: number;
	marginx?: number;
	marginy?: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
	rankdir: 'TB', // Top to bottom
	nodesep: 40, // Horizontal spacing between nodes
	ranksep: 60, // Vertical spacing between ranks
	marginx: 40,
	marginy: 40
};

/**
 * Compute graph layout using dagre algorithm
 * Returns node positions and edge points for rendering
 */
export function computeGraphLayout(
	nodes: GraphNode[],
	edges: GraphEdge[],
	options: LayoutOptions = {}
): LayoutResult {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	// Create a new directed graph
	const g = new dagre.graphlib.Graph();

	// Set graph options
	g.setGraph({
		rankdir: opts.rankdir,
		nodesep: opts.nodesep,
		ranksep: opts.ranksep,
		marginx: opts.marginx,
		marginy: opts.marginy
	});

	// Default edge label (required by dagre)
	g.setDefaultEdgeLabel(() => ({}));

	// Add nodes
	for (const node of nodes) {
		g.setNode(node.id, { width: node.width, height: node.height });
	}

	// Add edges (source blocks target, so edge goes from source to target)
	for (const edge of edges) {
		g.setEdge(edge.source, edge.target);
	}

	// Run the layout algorithm
	dagre.layout(g);

	// Extract node positions
	const nodePositions = new Map<string, NodePosition>();
	for (const nodeId of g.nodes()) {
		const node = g.node(nodeId);
		if (node) {
			// Dagre returns center coordinates, convert to top-left
			nodePositions.set(nodeId, {
				x: node.x - node.width / 2,
				y: node.y - node.height / 2,
				width: node.width,
				height: node.height
			});
		}
	}

	// Extract edge layouts with points
	// Adjust endpoints to center on nodes (dagre spreads them out which looks bad)
	const edgeLayouts: EdgeLayout[] = [];
	for (const e of g.edges()) {
		const edge = g.edge(e);
		if (edge && edge.points) {
			const sourceNode = g.node(e.v);
			const targetNode = g.node(e.w);

			// Get the original points
			const points = edge.points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));

			// Override first point to be center-bottom of source node
			if (sourceNode && points.length > 0) {
				points[0] = {
					x: sourceNode.x,
					y: sourceNode.y + sourceNode.height / 2
				};
			}

			// Override last point to be center-top of target node
			if (targetNode && points.length > 0) {
				points[points.length - 1] = {
					x: targetNode.x,
					y: targetNode.y - targetNode.height / 2
				};
			}

			edgeLayouts.push({
				source: e.v,
				target: e.w,
				points
			});
		}
	}

	// Get graph dimensions
	const graphInfo = g.graph();
	const width = graphInfo?.width || 0;
	const height = graphInfo?.height || 0;

	return {
		nodes: nodePositions,
		edges: edgeLayouts,
		width,
		height
	};
}

/**
 * Generate SVG path data for an edge using cubic bezier curves
 * Creates a smooth curved path that exits source vertically and enters target vertically
 */
export function generateEdgePath(points: { x: number; y: number }[]): string {
	if (points.length < 2) return '';

	const start = points[0];
	const end = points[points.length - 1];

	// Simple cubic bezier from start to end
	// Control points ensure vertical exit from source and vertical entry to target
	const deltaY = end.y - start.y;
	const controlOffset = Math.abs(deltaY) * 0.5;

	// First control point: directly below start (vertical exit)
	const cp1x = start.x;
	const cp1y = start.y + controlOffset;

	// Second control point: directly above end (vertical entry)
	const cp2x = end.x;
	const cp2y = end.y - controlOffset;

	return `M ${start.x} ${start.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${end.x} ${end.y}`;
}

/**
 * Calculate the viewport transform to fit all nodes with padding
 */
export function calculateFitTransform(
	graphWidth: number,
	graphHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	padding: number = 40
): { scale: number; translateX: number; translateY: number } {
	if (graphWidth === 0 || graphHeight === 0) {
		return { scale: 1, translateX: 0, translateY: 0 };
	}

	const availableWidth = viewportWidth - padding * 2;
	const availableHeight = viewportHeight - padding * 2;

	const scaleX = availableWidth / graphWidth;
	const scaleY = availableHeight / graphHeight;
	const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1x

	// Center the graph
	const scaledWidth = graphWidth * scale;
	const scaledHeight = graphHeight * scale;
	const translateX = (viewportWidth - scaledWidth) / 2;
	const translateY = (viewportHeight - scaledHeight) / 2;

	return { scale, translateX, translateY };
}
