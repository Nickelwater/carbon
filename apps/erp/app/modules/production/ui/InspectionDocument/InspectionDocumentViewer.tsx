import { Button, cn, HStack, IconButton, Spinner } from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuMinus, LuPlus } from "react-icons/lu";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { InspectionPlanRow } from "~/modules/quality/types";

const CALLOUT_STROKE = "#f97316";
const CALLOUT_HIGHLIGHT = "#2563eb";
const BALLOON_W_PCT = 4;
const BALLOON_H_PCT = 4;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

type AnchorRect = {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  featureId: string;
};

type BalloonOverlay = {
  featureId: string;
  balloonId: string;
  balloonAnchorId: string;
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function liangBarskySegmentRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): { u0: number; u1: number } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let u0 = 0;
  let u1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        u0 = Math.max(u0, r);
      } else {
        u1 = Math.min(u1, r);
      }
      if (u0 > u1) return null;
    }
  }
  return { u0, u1 };
}

function clippedBalloonToAnchorLine(
  bx: number,
  by: number,
  radiusPx: number,
  ax: number,
  ay: number,
  rect: { x: number; y: number; w: number; h: number }
): [number, number, number, number] | null {
  const L = Math.hypot(ax - bx, ay - by);
  if (L < 1e-6) return null;
  const epsU = Math.max(1e-4, 2 / L);
  const uBalloonExit = Math.min(1 - epsU, radiusPx / L + epsU);
  const { x, y, w, h } = rect;
  const hit = liangBarskySegmentRect(bx, by, ax, ay, x, y, x + w, y + h);
  let uEnd = 1 - epsU;
  if (hit) {
    const uEnter = Math.max(0, Math.min(1, hit.u0));
    if (uEnter > uBalloonExit) {
      uEnd = Math.min(uEnd, uEnter - epsU);
    }
  }
  if (uEnd <= uBalloonExit + 1e-4) return null;
  const x0 = bx + (ax - bx) * uBalloonExit;
  const y0 = by + (ay - by) * uBalloonExit;
  const x1 = bx + (ax - bx) * uEnd;
  const y1 = by + (ay - by) * uEnd;
  return [x0, y0, x1, y1];
}

function planRowsToOverlay(plan: InspectionPlanRow[]) {
  const anchors: AnchorRect[] = [];
  const balloons: BalloonOverlay[] = [];

  for (const row of plan) {
    if (!row.balloonId || row.regionX == null || row.regionY == null) continue;

    const balloonId = row.balloonId;
    const pageNumber = row.pageNumber ?? 1;

    anchors.push({
      id: balloonId,
      featureId: row.featureId,
      pageNumber,
      x: Number(row.regionX) * 100,
      y: Number(row.regionY) * 100,
      width: Number(row.regionWidth ?? 0.1) * 100,
      height: Number(row.regionHeight ?? 0.1) * 100
    });

    if (row.xCoordinate != null && row.yCoordinate != null) {
      balloons.push({
        featureId: row.featureId,
        balloonId,
        balloonAnchorId: balloonId,
        label: row.characteristic,
        pageNumber,
        x: Number(row.xCoordinate) * 100,
        y: Number(row.yCoordinate) * 100,
        width: BALLOON_W_PCT,
        height: BALLOON_H_PCT
      });
    }
  }

  return { anchors, balloons };
}

export type InspectionDocumentViewerProps = {
  pdfUrl: string;
  plan: InspectionPlanRow[];
  highlightFeatureId?: string | null;
  className?: string;
  fillHeight?: boolean;
};

export default function InspectionDocumentViewer({
  pdfUrl,
  plan,
  highlightFeatureId = null,
  className,
  fillHeight = false
}: InspectionDocumentViewerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [pdfViewPage, setPdfViewPage] = useState(1);
  const [pdfPageRendered, setPdfPageRendered] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [overlayHeight, setOverlayHeight] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0
  });
  const prevPdfViewPageRef = useRef(pdfViewPage);

  if (prevPdfViewPageRef.current !== pdfViewPage) {
    prevPdfViewPageRef.current = pdfViewPage;
    setPdfPageRendered(false);
  }

  const { anchors, balloons } = useMemo(() => planRowsToOverlay(plan), [plan]);

  const resetView = useCallback(() => {
    setZoomScale(1);
    requestAnimationFrame(() => {
      const el = viewportRef.current;
      if (!el) return;
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!highlightFeatureId) return;
    const row = plan.find((r) => r.featureId === highlightFeatureId);
    if (row?.pageNumber && row.pageNumber !== pdfViewPage) {
      setPdfViewPage(row.pageNumber);
    }
  }, [highlightFeatureId, plan, pdfViewPage]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setViewportWidth(w);
    });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!overlayRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      setOverlayHeight(h);
    });
    ro.observe(overlayRef.current);
    return () => ro.disconnect();
  }, []);

  const renderedWidth =
    viewportWidth > 0 ? Math.max(1, viewportWidth * zoomScale) : 0;

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    setZoomScale((current) =>
      Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Number((current + delta).toFixed(2)))
      )
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const el = viewportRef.current;
    if (!el) return;
    setIsPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop
    };
    el.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !viewportRef.current) return;
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    viewportRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    viewportRef.current.scrollTop = panStartRef.current.scrollTop - dy;
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setIsPanning(false);
    viewportRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 gap-2",
        fillHeight && "h-full flex-1",
        className
      )}
    >
      <HStack className="justify-between items-center gap-2 flex-wrap shrink-0 px-1">
        <HStack spacing={1} className="items-center">
          {numPages > 1 ? (
            <>
              <IconButton
                type="button"
                size="sm"
                variant="secondary"
                aria-label="Previous page"
                icon={<LuChevronLeft />}
                isDisabled={pdfViewPage <= 1}
                onClick={() => setPdfViewPage((p) => Math.max(1, p - 1))}
              />
              <span className="text-xs text-muted-foreground tabular-nums min-w-[5.5rem] text-center">
                <Trans>
                  Page {pdfViewPage} / {numPages}
                </Trans>
              </span>
              <IconButton
                type="button"
                size="sm"
                variant="secondary"
                aria-label="Next page"
                icon={<LuChevronRight />}
                isDisabled={pdfViewPage >= numPages}
                onClick={() => setPdfViewPage((p) => Math.min(numPages, p + 1))}
              />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              <Trans>Inspection drawing</Trans>
            </span>
          )}
        </HStack>

        <HStack spacing={1} className="items-center">
          <IconButton
            type="button"
            size="sm"
            variant="secondary"
            aria-label="Zoom out"
            icon={<LuMinus />}
            isDisabled={zoomScale <= MIN_ZOOM}
            onClick={() =>
              setZoomScale((z) =>
                Math.max(MIN_ZOOM, Number((z - 0.15).toFixed(2)))
              )
            }
          />
          <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-center">
            {Math.round(zoomScale * 100)}%
          </span>
          <IconButton
            type="button"
            size="sm"
            variant="secondary"
            aria-label="Zoom in"
            icon={<LuPlus />}
            isDisabled={zoomScale >= MAX_ZOOM}
            onClick={() =>
              setZoomScale((z) =>
                Math.min(MAX_ZOOM, Number((z + 0.15).toFixed(2)))
              )
            }
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={resetView}
          >
            <Trans>Reset</Trans>
          </Button>
        </HStack>
      </HStack>

      <p className="text-xs text-muted-foreground px-1 shrink-0">
        <Trans>Scroll or drag to pan. Use the mouse wheel to zoom.</Trans>
      </p>

      <div
        ref={viewportRef}
        className={cn(
          "w-full rounded-md border bg-muted/20 overflow-auto touch-none",
          fillHeight ? "flex-1 min-h-[280px]" : "min-h-[320px] max-h-[70dvh]",
          isPanning ? "cursor-grabbing" : "cursor-grab"
        )}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {!isMounted ? (
          <div className="flex items-center justify-center h-[280px]">
            <Spinner />
          </div>
        ) : (
          <div
            ref={overlayRef}
            className="relative select-none mx-auto"
            style={{ width: renderedWidth > 0 ? renderedWidth : "100%" }}
          >
            <div className="pointer-events-none">
              <Document
                file={pdfUrl}
                onLoadSuccess={(pdf) => {
                  setNumPages(pdf.numPages);
                  setPdfViewPage((current) =>
                    current > pdf.numPages ? 1 : current
                  );
                }}
              >
                {numPages > 0 ? (
                  <Page
                    key={`${pdfViewPage}-${zoomScale}`}
                    pageNumber={pdfViewPage}
                    width={renderedWidth > 0 ? renderedWidth : undefined}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="w-full"
                    onRenderSuccess={() => setPdfPageRendered(true)}
                  />
                ) : null}
              </Document>
            </div>

            {pdfPageRendered && renderedWidth > 0 && overlayHeight > 0 && (
              <div className="pointer-events-none absolute inset-0 z-[1]">
                <Stage
                  width={renderedWidth}
                  height={overlayHeight}
                  listening={false}
                >
                  <Layer>
                    {anchors
                      .filter((s) => s.pageNumber === pdfViewPage)
                      .map((s) => {
                        const x = (s.x / 100) * renderedWidth;
                        const y = (s.y / 100) * overlayHeight;
                        const width = (s.width / 100) * renderedWidth;
                        const height = (s.height / 100) * overlayHeight;
                        const isHighlighted =
                          s.featureId === highlightFeatureId;

                        return (
                          <Rect
                            key={`anchor-${s.id}`}
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            stroke={
                              isHighlighted ? CALLOUT_HIGHLIGHT : CALLOUT_STROKE
                            }
                            strokeWidth={isHighlighted ? 3 : 2}
                            fill={
                              isHighlighted
                                ? "rgba(37,99,235,0.12)"
                                : "rgba(249,115,22,0.08)"
                            }
                            fillEnabled
                            listening={false}
                          />
                        );
                      })}
                    {balloons
                      .filter((b) => b.pageNumber === pdfViewPage)
                      .map((b) => {
                        const balloonWidthPx = (b.width / 100) * renderedWidth;
                        const balloonHeightPx =
                          (b.height / 100) * overlayHeight;
                        const balloonX = (b.x / 100) * renderedWidth;
                        const balloonY = (b.y / 100) * overlayHeight;
                        const balloonCenterX = balloonX + balloonWidthPx / 2;
                        const balloonCenterY = balloonY + balloonHeightPx / 2;
                        const radius = Math.max(
                          8,
                          Math.min(balloonWidthPx, balloonHeightPx) / 2
                        );
                        const balloonLabelFontSize = Math.max(
                          14,
                          Math.min(26, Math.round(radius * 1.15))
                        );
                        const isHighlighted =
                          b.featureId === highlightFeatureId;
                        const linkedSelector = anchors.find(
                          (s) => s.id === b.balloonAnchorId
                        );

                        let linePoints:
                          | [number, number, number, number]
                          | null = null;
                        if (
                          linkedSelector &&
                          linkedSelector.pageNumber === pdfViewPage
                        ) {
                          const sx = (linkedSelector.x / 100) * renderedWidth;
                          const sy = (linkedSelector.y / 100) * overlayHeight;
                          const sw =
                            (linkedSelector.width / 100) * renderedWidth;
                          const sh =
                            (linkedSelector.height / 100) * overlayHeight;
                          linePoints = clippedBalloonToAnchorLine(
                            balloonCenterX,
                            balloonCenterY,
                            radius,
                            sx + sw / 2,
                            sy + sh / 2,
                            { x: sx, y: sy, w: sw, h: sh }
                          );
                        }

                        const stroke = isHighlighted
                          ? CALLOUT_HIGHLIGHT
                          : CALLOUT_STROKE;

                        return (
                          <Group
                            key={`balloon-${b.balloonId}`}
                            x={balloonX}
                            y={balloonY}
                            listening={false}
                          >
                            {linePoints && (
                              <Line
                                points={[
                                  linePoints[0] - balloonX,
                                  linePoints[1] - balloonY,
                                  linePoints[2] - balloonX,
                                  linePoints[3] - balloonY
                                ]}
                                stroke={stroke}
                                strokeWidth={isHighlighted ? 3 : 2}
                                listening={false}
                              />
                            )}
                            <Circle
                              x={balloonWidthPx / 2}
                              y={balloonHeightPx / 2}
                              radius={radius}
                              fill={
                                isHighlighted
                                  ? "rgba(37,99,235,0.14)"
                                  : "rgba(0,0,0,0)"
                              }
                              fillEnabled
                              stroke={stroke}
                              strokeWidth={isHighlighted ? 3 : 2}
                              listening={false}
                            />
                            <Text
                              x={balloonWidthPx / 2 - radius}
                              y={balloonHeightPx / 2 - radius}
                              width={radius * 2}
                              height={radius * 2}
                              text={b.label}
                              align="center"
                              verticalAlign="middle"
                              fill={stroke}
                              fontStyle="bold"
                              fontSize={balloonLabelFontSize}
                              listening={false}
                            />
                          </Group>
                        );
                      })}
                  </Layer>
                </Stage>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
