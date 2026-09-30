import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  HourglassOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Line } from "@ant-design/charts";
import { useSettings } from "../contexts/SettingsContext.js";
import { useEffect, useMemo, useState } from "react";
import { connectSocket } from "../services/apiConfigs.js";
import SuccessModal from "../components/common/SuccesModal.jsx";
import { message } from "antd";
import { postRequest } from "../services/request.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const numeric = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const MEASUREMENT_DURATION_SECONDS = 30;
const DEFAULT_X_TICK_COUNT = 4;

const formatSeconds = (seconds) =>
  Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(1));

const buildSamplesFromArrays = (data) => {
  const pressures = Array.isArray(data?.dataPressure) ? data.dataPressure : [];
  const leaks = Array.isArray(data?.dataLeak) ? data.dataLeak : [];
  const sampleCount = Math.max(pressures.length, leaks.length);

  if (sampleCount === 0) return [];

  return Array.from({ length: sampleCount }, (_, index) => {
    const pressure = numeric(pressures[index], NaN);
    const leak = numeric(leaks[index], NaN);

    return {
      time: index + 1,
      pressure,
      leak,
    };
  });
};

function TrendChart({
  samples,
  field,
  title,
  unit,
  min,
  max,
  time,
  progress,
  duration = MEASUREMENT_DURATION_SECONDS,
  x_TickCount = DEFAULT_X_TICK_COUNT,
  yMax = 600,
  y_TickCount,
}) {
  const leak = field === "leak";
  const color = leak ? "#e88300" : "#4e3bdc";
  const safeDuration = Math.max(
    1,
    numeric(duration, MEASUREMENT_DURATION_SECONDS),
    samples.at(-1)?.time || 0,
  );
  const safeXTickCount = Math.max(
    2,
    Math.round(numeric(x_TickCount, DEFAULT_X_TICK_COUNT)),
  );
  const chartData = samples
    .filter((sample) => Number.isFinite(sample[field]))
    .map((sample) => ({
      time: Number(sample.time),
      value: Number(sample[field]),
    }));
  const lastChartPoint = chartData.at(-1);
  const safeYMax = Math.max(1, numeric(yMax, 600));

  const annotations = [
    ...(!leak
      ? [
          {
            type: "rangeY",
            data: [Number(min), Number(max)],
            style: {
              fill: "#6554ee",
              fillOpacity: 0.08,
            },
          },
        ]
      : []),
    {
      type: "lineY",
      data: [Number(max)],
      style: {
        stroke: leak ? "#ff4d58" : "#9990ff",
        lineWidth: 2,
        lineDash: [6, 6],
      },
    },
    ...(!leak
      ? [
          {
            type: "lineY",
            data: [Number(min)],
            style: {
              stroke: "#9990ff",
              lineWidth: 1.5,
              lineDash: [6, 6],
            },
          },
        ]
      : []),
    {
      type: "text",
      data: [
        {
          time: safeDuration,
          value: Number(max),
          label: leak ? `Ngưỡng max: ${max} ${unit}` : `Max: ${max} ${unit}`,
        },
      ],
      xField: "time",
      yField: "value",
      textField: "label",
      style: {
        fill: "#ef4444",
        fontSize: 14,
        fontWeight: 500,
        textAlign: "right",
        textBaseline: "bottom",
        dx: -8,
        dy: -7,
        pointerEvents: "none",
      },
    },
    ...(!leak
      ? [
          {
            type: "text",
            data: [
              {
                time: safeDuration,
                value: Number(min),
                label: `Min: ${min} ${unit}`,
              },
            ],
            xField: "time",
            yField: "value",
            textField: "label",
            style: {
              fill: "#7164f5",
              fontSize: 14,
              fontWeight: 500,
              textAlign: "right",
              textBaseline: "top",
              dx: -8,
              dy: 7,
              pointerEvents: "none",
            },
          },
        ]
      : []),
    ...[
      {
        type: "lineX",
        data: lastChartPoint ? [lastChartPoint.time] : [],
        style: {
          stroke: color,
          strokeOpacity: 0.4,
          lineWidth: 2,
          lineDash: [5, 5],
        },
      },
      {
        type: "point",
        data: lastChartPoint ? [lastChartPoint] : [],
        xField: "time",
        yField: "value",
        sizeField: 2.5,
        shapeField: "circle",
        style: {
          fill: color,
          stroke: color,
          lineWidth: 1,
          pointerEvents: "none",
          shadowColor: color,
          shadowBlur: leak ? 0 : 8,
        },
      },
    ],
  ].map((annotation) => ({ ...annotation, animate: false }));

  const config = {
    data: chartData,
    xField: "time",
    yField: "value",
    autoFit: true,
    animate: false,
    color,
    legend: false,
    paddingLeft: 32,
    paddingRight: 16,
    paddingTop: 0,
    paddingBottom: 10,
    scale: {
      x: {
        domain: [0, safeDuration],
        tickCount: safeXTickCount,
        nice: false,
      },
      y: {
        domain: [0, safeYMax],
        tickCount: y_TickCount,
        nice: false,
      },
    },
    axis: {
      x: {
        title: false,
        line: true,
        lineStroke: "#cbd5e1",
        lineLineWidth: 1.5,
        tick: true,
        tickStroke: "#94a3b8",
        grid: true,
        gridStroke: "#eef2f8",
        gridLineDash: [3, 4],
        labelFormatter: (value) => `${formatSeconds(Number(value))}s`,
      },
      y: {
        title: false,
        line: true,
        lineStroke: "#cbd5e1",
        lineLineWidth: 1.5,
        tick: true,
        tickStroke: "#94a3b8",
        grid: true,
        gridStroke: "#edf1f7",
        labelFormatter: (value) => Number(Number(value).toFixed(1)),
      },
    },
    style: {
      stroke: color,
      lineWidth: 2,
    },
    area: {
      animate: false,
      style: {
        fill: color,
        fillOpacity: leak ? 0.14 : 0.2,
      },
    },
    point: {
      animate: false,
      data: lastChartPoint ? [lastChartPoint] : [],
      xField: "time",
      yField: "value",
      sizeField: 7,
      shapeField: "circle",
      style: {
        fill: "#ffffff",
        stroke: color,
        lineWidth: leak ? 1.5 : 3,
      },
    },
    annotations,
    tooltip: {
      title: (datum) => `${formatSeconds(Number(datum.time))}s`,
      items: [
        {
          channel: "y",
          name: title,
          valueFormatter: (value) => `${Number(value).toFixed(1)} ${unit}`,
        },
      ],
    },
  };

  return (
    <section className={`db-card db-chart ${leak ? "is-leak" : ""}`}>
      <div className="db-chart-heading">
        <h2>
          <i className="db-dot" />
          {title}
        </h2>
        <span className="db-chart-unit">(Đơn vị: {unit})</span>
        <span className="db-current">
          <i className="db-dot" />
          Hiện tại: {time}s ({progress}%)
        </span>
        <div className="db-legend">
          <span>
            <i className="db-line max" />
            {leak ? "Ngưỡng max" : "Max"} ({max} {unit})
          </span>
          {!leak && (
            <span>
              <i className="db-line min" />
              Min ({min} {unit})
            </span>
          )}
          <span>
            <i className="db-line measured" />
            {leak ? "Rò rỉ đo được" : "Áp suất đo"}
          </span>
        </div>
      </div>

      <div className="db-chart-body">
        <Line {...config} />
      </div>
    </section>
  );
}

function PressureGauge({ value, max }) {
  const ratio = clamp(value / max, 0, 1);
  return (
    <div className="db-gauge">
      <svg viewBox="0 0 400 265" role="img" aria-label={`Áp suất ${value} Pa`}>
        <defs>
          <linearGradient id="gauge-orange">
            <stop stopColor="#f45b05" />
            <stop offset="100%" stopColor="#ff9238" />
          </linearGradient>
        </defs>
        <path
          d="M50 195 A150 150 0 0 1 350 195"
          fill="none"
          stroke="#e2e8f1"
          strokeWidth="30"
          strokeLinecap="round"
        />
        {ratio > 0 && (
          <path
            d="M50 195 A150 150 0 0 1 350 195"
            fill="none"
            stroke="url(#gauge-orange)"
            strokeWidth="30"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${ratio * 100} 100`}
          />
        )}
        {Array.from({ length: 6 }, (_, index) => {
          const angle = Math.PI + (index / 5) * Math.PI;
          return (
            <g key={index}>
              <line
                x1={200 + Math.cos(angle) * 134}
                y1={195 + Math.sin(angle) * 134}
                x2={200 + Math.cos(angle) * 123}
                y2={195 + Math.sin(angle) * 123}
                stroke="#98a8be"
                strokeWidth="2"
              />
              <text
                x={200 + Math.cos(angle) * 111}
                y={195 + Math.sin(angle) * 111 + 5}
                textAnchor="middle"
                fill="#71819b"
                fontSize="15"
                fontWeight="550"
              >
                {Math.round((max * index) / 5)}
              </text>
            </g>
          );
        })}
        <line
          x1="200"
          y1="195"
          x2="80"
          y2="195"
          stroke="#22c55e"
          strokeWidth="4"
          style={{
            transformOrigin: "200px 195px",
            transform: `rotate(${ratio * 180}deg)`,
            transition: "transform .4s ease",
          }}
        />
        <circle cx="200" cy="195" r="15" fill="#202c40" />
        <circle cx="200" cy="195" r="7" fill="#22c55e" />
      </svg>
      <div className="db-gauge-value">
        {value.toFixed(1)} <span>Pa</span>
      </div>
    </div>
  );
}

function DashboardPage({
  historyDetail,
  realtimeEnabled = !historyDetail,
  onMeasurementStart,
  visible = true,
}) {
  const { threshold } = useSettings();
  const [openModal, setOpenModal] = useState(false);
  const isHistoryMode = Boolean(historyDetail);
  const [liveData, setLiveData] = useState(null);
  const [idHistory, setIdHistory] = useState();
  const measurement = isHistoryMode ? historyDetail : liveData;

  const duration = Math.max(
    1,
    numeric(measurement?.settingCycleTime, MEASUREMENT_DURATION_SECONDS),
  );

  const elapsedTime = Math.max(0, numeric(measurement?.testTime));
  const pressure =
    numeric(measurement?.actualPressure) ??
    numeric(liveData?.dataPressure.at(-1));
  const leak =
    numeric(measurement?.actualLeak) ?? numeric(liveData?.dataLeak.at(-1));
  const complete =
    measurement?.cycleEnd === true ||
    (isHistoryMode && measurement?.cycleEnd == null);
  const progress = complete
    ? 100
    : clamp(Math.round((elapsedTime / duration) * 100), 0, 99);
  const status = String(measurement?.status || "").toUpperCase();
  // check hiển thị text vượt ngưỡng ?
  const pressureBelow = pressure < threshold.min;
  const pressureAbove = pressure > threshold.max;
  const outside = pressureBelow || pressureAbove;
  const pressureStateText = pressureBelow
    ? "Dưới ngưỡng cho phép"
    : pressureAbove
      ? "Vượt ngưỡng cho phép"
      : "Ổn định";

  const samples = useMemo(() => {
    return buildSamplesFromArrays(measurement);
  }, [measurement]);

  const leakOutside = leak > threshold.leakMax;
  const failed = ["PASS", "FAIL"].includes(status)
    ? status === "FAIL"
    : outside || leakOutside;
  const running = !complete && (elapsedTime > 0 || samples.length > 0);
  const phaseText = complete ? "Hoàn thành" : running ? "Đang đo" : "Chờ đo";
  const resultText =
    !complete && !running
      ? "Chờ đo"
      : complete
        ? failed
          ? "Fail"
          : "Pass"
        : "Đang đo";
  const maxMeasuredPressure = Math.max(
    0,
    pressure,
    ...samples.map((sample) => numeric(sample.pressure, 0)),
  );
  const pressureChartMax = Math.max(
    600,
    Math.ceil((Math.max(maxMeasuredPressure, threshold.max) * 1.12) / 50) * 50,
  );
  const leakChartMax = Math.max(
    30,
    threshold.leakMax * 1.12,
    ...samples.map((sample) => numeric(sample.leak) * 1.12),
  );

  useEffect(() => {
    if (!realtimeEnabled) return;

    let ws;
    let disposed = false;
    let completedCycle = null;
    let saveVersion = 0;
    let previousCycle = null;

    const saveHistory = async (data, version) => {
      try {
        const { id: _id, ...payload } = data;
        const res = await postRequest("/api/history", payload);
        if (disposed || version !== saveVersion) return;
        setIdHistory(res?.id);
        message.success("Lưu lịch sử thành công");
      } catch (error) {
        if (disposed || version !== saveVersion) return;
        console.error("Lỗi lưu lịch sử", error);
        message.error("Lưu lịch sử thất bại");
      }
    };

    const connect = async () => {
      try {
        ws = await connectSocket("ws://127.0.0.1:4000", (data) => {
          if (disposed || !data || typeof data !== "object") return;
          const cycleKey = JSON.stringify([data.id, data.startTime]);
          const elapsed = Math.max(0, numeric(data.testTime));
          const sampleCount = Math.max(
            Array.isArray(data.dataPressure) ? data.dataPressure.length : 0,
            Array.isArray(data.dataLeak) ? data.dataLeak.length : 0,
          );
          const measuring =
            data.cycleEnd !== true && (elapsed > 0 || sampleCount > 0);
          const startsNewCycle =
            measuring &&
            (!previousCycle?.measuring ||
              previousCycle.key !== cycleKey ||
              elapsed < previousCycle.elapsed ||
              sampleCount < previousCycle.sampleCount);
          previousCycle = { key: cycleKey, measuring, elapsed, sampleCount };
          if (startsNewCycle) onMeasurementStart?.();
          if (data.cycleEnd !== true) {
            completedCycle = null;
            saveVersion += 1;
            setLiveData(data);
            setIdHistory(undefined);
            setOpenModal(false);
            return;
          }
          // Repeated final packets must not reopen or save the same cycle.
          if (completedCycle === cycleKey) return;
          completedCycle = cycleKey;
          setLiveData(data);
          setIdHistory(undefined);
          setOpenModal(true);
          void saveHistory(data, ++saveVersion);
        });
        if (disposed) ws.close();
      } catch (error) {
        console.error("WebSocket connection error:", error);
      }
    };

    connect();

    return () => {
      disposed = true;
      ws?.close();
    };
  }, [realtimeEnabled, onMeasurementStart]);

  const handleCloseSuccessModal = () => {
    setOpenModal(false);
    setLiveData(null);
  };

  return (
    <div className="dashboard-content">
      <div className="db-summary">
        <section className="db-card db-program">
          <div>
            <div className="db-label">TÊN CHƯƠNG TRÌNH</div>
            <strong>
              {measurement?.programName ||
                historyDetail?.trayCode ||
                "UNIT-DX-2024"}
            </strong>
          </div>
          <span className="db-icon">
            <FileTextOutlined />
          </span>
        </section>
        <section className="db-card db-progress">
          <div className="db-progress-heading">
            <span className="db-icon">
              {complete ? (
                <CheckCircleOutlined />
              ) : (
                <HourglassOutlined spin={running} />
              )}
            </span>
            <div>
              <strong>{phaseText}</strong>
              <div>TIẾN ĐỘ: {progress}%</div>
            </div>
          </div>
          <div
            className="db-progress-track"
            role="progressbar"
            aria-label="Tiến độ đo"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>
        <section
          className={`db-card db-result ${
            complete ? (failed ? "is-failed" : "is-passed") : ""
          }`}
        >
          <div>
            <div className="db-label">KẾT QUẢ</div>

            <span className="db-result-badge">
              {complete ? (
                failed ? (
                  <CloseCircleOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              ) : (
                <SyncOutlined spin={running} />
              )}

              {resultText}
            </span>
          </div>

          <span className="db-icon">
            {complete ? (
              failed ? (
                <CloseCircleOutlined />
              ) : (
                <CheckCircleOutlined />
              )
            ) : (
              <SyncOutlined spin={running} />
            )}
          </span>
        </section>
      </div>
      <div className="db-main">
        <div className="db-metrics">
          <section className="db-card db-gauge-card">
            <div className="db-card-heading">
              <h2>
                <i className="db-dot" />
                ĐỒNG HỒ ÁP SUẤT
              </h2>
              <span className="db-unit">Pa</span>
            </div>
            <div className="db-gauge-space">
              <PressureGauge
                value={pressure}
                max={Math.max(500, threshold.max)}
              />
            </div>
            <div className="db-gauge-footer">
              <span>
                Tiêu chuẩn: {threshold.min} - {threshold.max} Pa
              </span>
              <strong className={outside ? "db-danger" : "db-ok"}>
                {pressureStateText}
              </strong>
            </div>
          </section>
          <section className="db-card db-pressure-reading">
            <div>
              <strong className="db-label">
                <span>
                  {progress < 100 ? "ÁP SUẤT HIỆN TẠI" : "ÁP SUẤT ĐO ĐƯỢC"}
                </span>
              </strong>
              <p>Cảm biến buồng thử áp lực chính</p>
            </div>
            <strong className={outside ? "db-danger" : ""}>
              {pressure} <span>Pa</span>
            </strong>
          </section>
          <section className="db-card db-leak-readings">
            <div>
              <div className="db-label">RÒ RỈ</div>
              <strong className={leakOutside ? "db-danger" : ""}>
                {leak} <span>Pa/s</span>
              </strong>
            </div>
            <div>
              <div className="db-label">NGƯỠNG MAX</div>
              <strong>
                {threshold.leakMax} <span>Pa/s</span>
              </strong>
            </div>
          </section>
        </div>
        <div className="db-charts">
          <TrendChart
            time={elapsedTime}
            samples={samples}
            field="pressure"
            title="BIỂU ĐỒ ÁP SUẤT"
            unit="Pa"
            min={threshold.min}
            max={threshold.max}
            progress={progress}
            duration={duration}
            x_TickCount={4}
            yMax={pressureChartMax}
            y_TickCount={5}
          />
          <TrendChart
            time={elapsedTime}
            samples={samples}
            field="leak"
            title="RÒ RỈ KHÍ THEO THỜI GIAN"
            unit="Pa/s"
            max={threshold.leakMax}
            progress={progress}
            duration={duration}
            x_TickCount={4}
            yMax={leakChartMax}
            y_TickCount={4}
          />
        </div>
      </div>
      {openModal && visible && !isHistoryMode && (
        <SuccessModal
          idHistory={idHistory}
          open={!openModal}
          data={liveData}
          threshold={threshold}
          onCancel={handleCloseSuccessModal}
        />
      )}
    </div>
  );
}

export default DashboardPage;
