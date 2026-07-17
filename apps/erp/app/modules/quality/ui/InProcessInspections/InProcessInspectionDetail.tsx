import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Table as UiTable,
  VStack
} from "@carbon/react";
import type { ChartConfig } from "@carbon/react/Chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@carbon/react/Chart";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis
} from "recharts";
import {
  computeCapabilityIndices,
  computeIMRChart
} from "~/modules/quality/spc";

function getStatusVariant(status: string) {
  if (status === "Passed") return "green";
  if (status === "Failed") return "red";
  if (status === "In Progress") return "blue";
  if (status === "Cancelled") return "secondary";
  return "secondary";
}

type Measurement = {
  id: string;
  measuredValue: string | null;
  measuredValueNumeric: number | null;
  inTolerance: boolean | null;
  inspectionFeature?: {
    name?: string | null;
    nominalValue?: string | null;
    tolerancePlus?: string | null;
    toleranceMinus?: string | null;
    unit?: string | null;
  } | null;
};

type Sample = {
  id: string;
  sampleIndex: number | null;
  status: string;
  inspectedAt: string | null;
  inspectionSampleMeasurement?: Measurement[] | null;
};

export type InProcessInspectionDetailProps = {
  inspection: {
    id: string;
    inspectionId: string;
    status: string;
    triggerType: string | null;
    triggerOrdinal: number | null;
    triggerThreshold: number | null;
    samplesPerRun: number | null;
    requiredForLotAcceptance: boolean | null;
    reaction: string | null;
    jobId: string | null;
    jobOperationDescription: string | null;
    item?: { readableId?: string; name?: string } | null;
    inspectionSample?: Sample[] | null;
  };
};

export default function InProcessInspectionDetail({
  inspection
}: InProcessInspectionDetailProps) {
  const { t } = useLingui();
  const samples = inspection.inspectionSample ?? [];

  const measurementsByFeature = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        unit: string | null;
        values: number[];
        lsl: number | null;
        usl: number | null;
      }
    >();
    for (const sample of samples) {
      for (const measurement of sample.inspectionSampleMeasurement ?? []) {
        if (measurement.measuredValueNumeric == null) continue;
        const feature = measurement.inspectionFeature;
        const key = feature?.name ?? measurement.id;
        const nominal = feature?.nominalValue
          ? Number(feature.nominalValue)
          : null;
        const plus = feature?.tolerancePlus
          ? Number(feature.tolerancePlus)
          : null;
        const minus = feature?.toleranceMinus
          ? Number(feature.toleranceMinus)
          : null;
        const entry = map.get(key) ?? {
          name: key,
          unit: feature?.unit ?? null,
          values: [],
          lsl: nominal != null && minus != null ? nominal - minus : null,
          usl: nominal != null && plus != null ? nominal + plus : null
        };
        entry.values.push(measurement.measuredValueNumeric);
        map.set(key, entry);
      }
    }
    return Array.from(map.values());
  }, [samples]);

  const chartConfig = {
    individual: { color: "hsl(var(--chart-1))", label: t`Measurement` }
  } satisfies ChartConfig;

  return (
    <VStack spacing={4} className="p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {inspection.inspectionId}
            <Badge variant={getStatusVariant(inspection.status)}>
              {inspection.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">
                <Trans>Item</Trans>
              </div>
              <div>{inspection.item?.readableId ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">
                <Trans>Job / Operation</Trans>
              </div>
              <div>
                {inspection.jobId ?? "—"}
                {inspection.jobOperationDescription
                  ? ` · ${inspection.jobOperationDescription}`
                  : ""}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                <Trans>Trigger</Trans>
              </div>
              <div>
                {inspection.triggerType} #{inspection.triggerOrdinal} @{" "}
                {inspection.triggerThreshold}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                <Trans>Reaction</Trans>
              </div>
              <div>
                {inspection.reaction ?? "—"}
                {inspection.requiredForLotAcceptance
                  ? ` · ${t`Required for Lot Accept`}`
                  : ""}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Samples</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {samples.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Trans>No samples recorded yet.</Trans>
            </p>
          ) : (
            <UiTable>
              <Thead>
                <Tr>
                  <Th>
                    <Trans>#</Trans>
                  </Th>
                  <Th>
                    <Trans>Status</Trans>
                  </Th>
                  <Th>
                    <Trans>Measurements</Trans>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {samples.map((sample) => (
                  <Tr key={sample.id}>
                    <Td>{sample.sampleIndex}</Td>
                    <Td>
                      <Badge variant={getStatusVariant(sample.status)}>
                        {sample.status}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-0.5 text-xs">
                        {(sample.inspectionSampleMeasurement ?? []).map((m) => (
                          <span key={m.id}>
                            {m.inspectionFeature?.name}: {m.measuredValue}{" "}
                            {m.inspectionFeature?.unit}{" "}
                            {m.inTolerance === false && (
                              <Badge variant="red">OOT</Badge>
                            )}
                          </span>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </UiTable>
          )}
        </CardContent>
      </Card>

      {measurementsByFeature.map((feature) => {
        if (feature.values.length < 2) return null;
        const chartPoints = computeIMRChart(feature.values);
        const capability = computeCapabilityIndices({
          values: feature.values,
          lsl: feature.lsl,
          usl: feature.usl
        });
        return (
          <Card key={feature.name}>
            <CardHeader>
              <CardTitle>
                <Trans>SPC — {feature.name}</Trans>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-6 text-sm mb-4">
                <div>
                  <div className="text-muted-foreground">
                    <Trans>Mean</Trans>
                  </div>
                  <div>{capability.mean?.toFixed(4) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cp</div>
                  <div>{capability.cp?.toFixed(2) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cpk</div>
                  <div>{capability.cpk?.toFixed(2) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Pp</div>
                  <div>{capability.pp?.toFixed(2) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Ppk</div>
                  <div>{capability.ppk?.toFixed(2) ?? "—"}</div>
                </div>
              </div>
              <ChartContainer
                config={chartConfig}
                className="min-h-[30vh] h-[300px] w-full"
              >
                <LineChart accessibilityLayer data={chartPoints}>
                  <CartesianGrid vertical={false} />
                  <YAxis
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                    domain={["auto", "auto"]}
                  />
                  <XAxis
                    dataKey="index"
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  {feature.usl != null && (
                    <ReferenceLine
                      y={feature.usl}
                      stroke="red"
                      strokeDasharray="4 4"
                    />
                  )}
                  {feature.lsl != null && (
                    <ReferenceLine
                      y={feature.lsl}
                      stroke="red"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Line
                    dataKey="individual"
                    type="linear"
                    stroke="var(--color-individual)"
                    strokeWidth={2}
                    dot={{ fill: "var(--color-individual)", r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        );
      })}
    </VStack>
  );
}
