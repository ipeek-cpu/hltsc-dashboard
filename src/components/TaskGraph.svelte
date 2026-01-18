<script lang="ts">
  import type { Issue } from '$lib/types';
  import {
    computeGraphLayout,
    generateEdgePath,
    calculateFitTransform,
    type LayoutResult
  } from '$lib/graph-layout';
  import TaskGraphNode from './TaskGraphNode.svelte';
  import Icon from './Icon.svelte';

  let {
    issues,
    blockingRelations,
    onissueclick
  }: {
    issues: Issue[];
    blockingRelations: { source: string; target: string }[];
    onissueclick?: (issueId: string) => void;
  } = $props();

  // Node dimensions (must match TaskGraphNode styling)
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 80;

  // Viewport state
  let containerEl: HTMLDivElement | null = $state(null);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  // Drag state
  let isDragging = $state(false);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let panStartX = $state(0);
  let panStartY = $state(0);

  // Zoom limits
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 2;

  // Track if we need to auto-fit (on initial load)
  let needsAutoFit = $state(true);

  // Compute layout as derived value (not effect) to avoid loops
  let layout = $derived.by(() => {
    if (issues.length === 0) {
      return null;
    }

    const nodes = issues.map((issue) => ({
      id: issue.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    }));

    const edges = blockingRelations.map((rel) => ({
      source: rel.source,
      target: rel.target
    }));

    return computeGraphLayout(nodes, edges);
  });

  // Auto-fit when layout first becomes available
  $effect(() => {
    if (layout && containerEl && needsAutoFit) {
      needsAutoFit = false;
      requestAnimationFrame(() => {
        doFitToView();
      });
    }
  });

  function doFitToView() {
    if (!containerEl || !layout) return;

    const rect = containerEl.getBoundingClientRect();
    const { scale, translateX, translateY } = calculateFitTransform(
      layout.width,
      layout.height,
      rect.width,
      rect.height,
      60
    );

    zoom = scale;
    panX = translateX;
    panY = translateY;
  }

  function fitToView() {
    doFitToView();
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();

    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return;

    // Mouse position relative to container
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * zoomFactor));

    if (newZoom === zoom) return;

    // Adjust pan to zoom toward mouse position
    const zoomRatio = newZoom / zoom;
    panX = mouseX - (mouseX - panX) * zoomRatio;
    panY = mouseY - (mouseY - panY) * zoomRatio;
    zoom = newZoom;
  }

  function handleMouseDown(e: MouseEvent) {
    // Only pan on left click and not on nodes
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.task-node')) return;

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    panX = panStartX + deltaX;
    panY = panStartY + deltaY;
  }

  function handleMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  function zoomIn() {
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.2);
    // Zoom toward center
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const zoomRatio = newZoom / zoom;
      panX = centerX - (centerX - panX) * zoomRatio;
      panY = centerY - (centerY - panY) * zoomRatio;
    }
    zoom = newZoom;
  }

  function zoomOut() {
    const newZoom = Math.max(MIN_ZOOM, zoom / 1.2);
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const zoomRatio = newZoom / zoom;
      panX = centerX - (centerX - panX) * zoomRatio;
      panY = centerY - (centerY - panY) * zoomRatio;
    }
    zoom = newZoom;
  }

  function handleNodeClick(issueId: string) {
    onissueclick?.(issueId);
  }

  // Generate edge paths for SVG (scaled by zoom)
  let edgePaths = $derived(() => {
    if (!layout) return [];
    return layout.edges.map((edge) => ({
      ...edge,
      path: generateEdgePath(edge.points.map(p => ({ x: p.x * zoom, y: p.y * zoom })))
    }));
  });

  // Get node positions from layout
  function getNodePosition(issueId: string): { x: number; y: number } | null {
    if (!layout) return null;
    const pos = layout.nodes.get(issueId);
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  const zoomPercent = $derived(Math.round(zoom * 100));
</script>

<div
  class="graph-container"
  bind:this={containerEl}
  onwheel={handleWheel}
  onmousedown={handleMouseDown}
  class:dragging={isDragging}
  role="application"
  aria-label="Task dependency graph"
>
  <!-- Zoom controls -->
  <div class="zoom-controls">
    <button class="zoom-btn" onclick={zoomOut} title="Zoom out">
      <Icon name="minus" size={16} />
    </button>
    <span class="zoom-level">{zoomPercent}%</span>
    <button class="zoom-btn" onclick={zoomIn} title="Zoom in">
      <Icon name="plus" size={16} />
    </button>
    <button class="zoom-btn fit-btn" onclick={fitToView} title="Fit to view">
      <Icon name="maximize-2" size={16} />
    </button>
  </div>

  <!-- Transform wrapper (pan only, no scale - nodes handle their own sizing) -->
  <div
    class="graph-transform"
    style="transform: translate3d({panX}px, {panY}px, 0)"
  >
    <!-- SVG layer for edges -->
    {#if layout}
      <svg class="edges-layer" width={layout.width * zoom} height={layout.height * zoom}>
        {#each edgePaths() as edge (edge.source + '-' + edge.target)}
          <path
            d={edge.path}
            fill="none"
            stroke="#d0d0d0"
            stroke-width={2 * zoom}
          />
        {/each}
      </svg>
    {/if}

    <!-- Nodes layer -->
    <div class="nodes-layer">
      {#each issues as issue (issue.id)}
        {@const pos = getNodePosition(issue.id)}
        {#if pos}
          <TaskGraphNode
            {issue}
            x={pos.x * zoom}
            y={pos.y * zoom}
            {zoom}
            onclick={handleNodeClick}
          />
        {/if}
      {/each}
    </div>
  </div>

  <!-- Empty state -->
  {#if issues.length === 0}
    <div class="empty-state">
      <Icon name="git-branch" size={48} />
      <p>No tasks in this epic</p>
    </div>
  {/if}
</div>

<style>
  .graph-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #fafafa;
    cursor: grab;
  }

  .graph-container.dragging {
    cursor: grabbing;
  }

  .zoom-controls {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 10;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: #666666;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .zoom-btn:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .zoom-level {
    min-width: 48px;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    color: #666666;
    font-family: 'Figtree', sans-serif;
  }

  .fit-btn {
    margin-left: 4px;
    border-left: 1px solid #e0e0e0;
    padding-left: 8px;
    border-radius: 0 6px 6px 0;
  }

  .graph-transform {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
    /* Crisp rendering when zoomed */
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    -webkit-font-smoothing: subpixel-antialiased;
  }

  .edges-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  .nodes-layer {
    position: relative;
  }

  .empty-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #888888;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    font-family: 'Figtree', sans-serif;
  }
</style>
