/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarOutlined,
  EyeOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import {
  Button,
  Col,
  DatePicker,
  Flex,
  Progress,
  Pagination,
  Row,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { Column } from "@ant-design/charts";
import dayjs from "dayjs";
import { getRequest } from "../services/request";

const { RangePicker } = DatePicker;

function HistoryPage({ resetKey, onViewDetail }) {
  const chartPeriods = useMemo(
    () => ["00-04h", "04-08h", "08-12h", "12-16h", "16-20h", "20-24h"],
    [],
  );

  const [allMeasurements, setAllMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState(null);
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const tableViewportRef = useRef(null);
  const [tableBodyHeight, setTableBodyHeight] = useState(216);

  const [historySummary, setHistorySummary] = useState({
    total: 0,
    pass_count: 0,
    fail_count: 0,
    chart: [],
  });

  useEffect(() => {
    setPagination((current) => ({
      ...current,
      page: 1,
    }));
    setStatusFilter("all");
    setDateRange(null);
    setError("");
  }, [resetKey]);

  useLayoutEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    const header = viewport.querySelector(".ant-table-header");
    const resize = () => {
      const headerHeight = header?.getBoundingClientRect().height ?? 52;
      setTableBodyHeight(
        Math.max(1, Math.floor(viewport.clientHeight - headerHeight)),
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    if (header) observer.observe(header);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const filterParams = new URLSearchParams();

        if (statusFilter && statusFilter !== "all") {
          filterParams.set("status", statusFilter);
        }

        if (dateRange?.[0] && dateRange?.[1]) {
          filterParams.set("fromDate", dateRange[0].format("YYYY-MM-DD"));
          filterParams.set("toDate", dateRange[1].format("YYYY-MM-DD"));
        }

        const tableParams = new URLSearchParams(filterParams);
        tableParams.set("page", String(pagination.page));
        tableParams.set("pageSize", String(pagination.pageSize));

        const response = await getRequest(
          `/api/history?${tableParams.toString()}`,
        );

        if (!alive) return;

        setAllMeasurements(response?.items || []);
        setPagination((current) => ({
          ...current,
          total: Number(response?.total) || 0,
        }));
      } catch (loadError) {
        console.error("HistoryWeb load error:", loadError);

        if (alive) {
          setAllMeasurements([]);
          setPagination((current) => ({
            ...current,
            total: 0,
          }));
          setError("Không thể tải dữ liệu lịch sử.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();

    return () => {
      alive = false;
    };
  }, [pagination.page, pagination.pageSize, statusFilter, dateRange]);

  useEffect(() => {
    let alive = true;

    async function loadSummary() {
      try {
        const filterParams = new URLSearchParams();

        if (statusFilter && statusFilter !== "all") {
          filterParams.set("status", statusFilter);
        }

        if (dateRange?.[0] && dateRange?.[1]) {
          filterParams.set("fromDate", dateRange[0].format("YYYY-MM-DD"));
          filterParams.set("toDate", dateRange[1].format("YYYY-MM-DD"));
        }

        const summaryResponse = await getRequest(
          `/api/history/summary?${filterParams.toString()}`,
        );

        if (!alive) return;

        setHistorySummary({
          total: Number(summaryResponse?.total) || 0,
          pass_count: Number(summaryResponse?.pass_count) || 0,
          fail_count: Number(summaryResponse?.fail_count) || 0,
          chart: Array.isArray(summaryResponse?.chart)
            ? summaryResponse.chart
            : [],
        });
      } catch (summaryError) {
        console.error("History summary load error:", summaryError);

        if (alive) {
          setHistorySummary({
            total: 0,
            pass_count: 0,
            fail_count: 0,
            chart: [],
          });
        }
      }
    }

    loadSummary();

    return () => {
      alive = false;
    };
  }, [statusFilter, dateRange]);

  // Dữ liệu đã được filter + phân trang từ API
  const tableRows = useMemo(() => {
    return allMeasurements.map((item) => ({
      id: item.id,
      wheelCode: item.trayCode,
      status: item.status,
      leakage: item.actualLeak,
      pressure: item.actualPressure,
      measuredAt: item.startTime,
      startTime: item.startTime
        ? dayjs(item.startTime).format("HH:mm:ss")
        : "--:--:--",
      startDate: item.startTime
        ? dayjs(item.startTime).format("DD/MM/YYYY")
        : "--/--/----",
      endTime: item.endTime
        ? dayjs(item.endTime).format("HH:mm:ss")
        : "--:--:--",
      endDate: item.endTime
        ? dayjs(item.endTime).format("DD/MM/YYYY")
        : "--/--/----",
      cycleTime: item.settingCycleTime ?? item.testTime ?? item.cycleTime,
      testTime: item.testTime,
      programName: item.programName,
      leakUnit: item.leakUnit,
      pressureUnit: item.pressureUnit,
      data: item.data,
      dataLeak: item.dataLeak,
      dataPressure: item.dataPressure,
    }));
  }, [allMeasurements]);

  // Thống kê tổng quan
  const summary = useMemo(() => {
    return {
      total: Number(historySummary.total) || 0,
      pass_count: Number(historySummary.pass_count) || 0,
      fail_count: Number(historySummary.fail_count) || 0,
    };
  }, [historySummary]);

  // Biểu đồ cột 24h
  const chartData = useMemo(() => {
    const buckets = {};
    chartPeriods.forEach((p) => {
      buckets[p] = { Pass: 0, Fail: 0 };
    });

    historySummary.chart.forEach((item) => {
      if (!buckets[item.period]) return;
      if (item.type !== "Pass" && item.type !== "Fail") return;
      buckets[item.period][item.type] = Number(item.value) || 0;
    });

    return chartPeriods.flatMap((period) => [
      {
        period,
        type: "Pass",
        value: buckets[period].Pass,
      },
      {
        period,
        type: "Fail",
        value: buckets[period].Fail,
      },
    ]);
  }, [historySummary, chartPeriods]);

  const handleViewDetail = useCallback(
    async (record) => {
      if (!record?.id) return;

      setDetailLoadingId(record.id);
      try {
        const detail = await getRequest(`/api/history/${record.id}`);
        onViewDetail?.(detail);
      } catch (detailError) {
        console.error("History detail load error:", detailError);
        setError("Không thể tải dữ liệu chi tiết lịch sử.");
      } finally {
        setDetailLoadingId(null);
      }
    },
    [onViewDetail],
  );

  const columns = useMemo(
    () => [
      {
        title: "STT",
        key: "index",
        width: "8%",
        align: "center",
        render: (_, __, index) =>
          (pagination.page - 1) * pagination.pageSize + index + 1,
      },
      {
        title: "THỜI GIAN BẮT ĐẦU",
        dataIndex: "startTime",
        width: "14%",
        render: (_, record) => (
          <Flex vertical gap={2} className="history-time">
            <strong>{record.startTime}</strong>
            <span>{record.startDate}</span>
          </Flex>
        ),
      },
      {
        title: "THỜI GIAN KẾT THÚC",
        dataIndex: "endTime",
        width: "14%",
        render: (_, record) => (
          <Flex vertical gap={2} className="history-time">
            <strong>{record.endTime}</strong>
            <span>{record.endDate}</span>
          </Flex>
        ),
      },
      {
        title: "MÃ MÂM XE",
        dataIndex: "wheelCode",
        width: "19%",
        render: (value) => <span className="wheel-code">{value || "--"}</span>,
      },
      {
        title: "TRẠNG THÁI",
        dataIndex: "status",
        width: "11%",
        align: "center",
        render: (status) => {
          const isPass = String(status || "").toLowerCase() === "pass";
          return (
            <Tag className={`status-tag ${isPass ? "pass" : "fail"}`}>
              {isPass ? "Pass" : "Fail"}
            </Tag>
          );
        },
      },
      {
        title: "MỨC ĐỘ RÒ RỈ",
        dataIndex: "leakage",
        width: "12%",
        align: "center",
        render: (value) => <span className="leak-value">{value}</span>,
      },
      {
        title: "ÁP SUẤT KIỂM TRA",
        dataIndex: "pressure",
        width: "14%",
        align: "center",
        render: (value) => <span className="pressure-text">{value}</span>,
      },
      {
        title: "HÀNH ĐỘNG",
        key: "action",
        width: "8%",
        align: "center",
        render: (_, record) => (
          <Button
            type="text"
            className="view-button"
            icon={<EyeOutlined />}
            loading={detailLoadingId === record.id}
            onClick={() => handleViewDetail(record)}
          />
        ),
      },
    ],
    [detailLoadingId, handleViewDetail, pagination.page, pagination.pageSize],
  );

  const chartConfig = useMemo(
    () => ({
      data: chartData,
      xField: "period",
      yField: "value",
      colorField: "type",
      group: true,
      autoFit: true,
      paddingBottom: 24,
      legend: false,
      scale: {
        x: { domain: chartPeriods },
        y: {
          domain: [0, Math.max(10, ...chartData.map((d) => d.value))],
          tickCount: 7,
          nice: true,
        },
        color: { range: ["#4664e9", "#ef3b67"] },
      },
      axis: {
        x: {
          title: false,
          tick: false,
          line: true,
          lineStroke: "#667085",
          lineLineWidth: 1,
          grid: true,
          gridStroke: "#eef1f5",
          gridLineWidth: 1,
          labelFill: "#556274",
          labelFontSize: 11,
          labelFontWeight: 600,
          labelAutoRotate: false,
          labelAutoHide: false,
        },
        y: {
          title: false,
          tick: false,
          line: true,
          lineStroke: "#556274",
          lineLineWidth: 1.25,
          labelFill: "#556274",
          labelFontSize: 11,
          labelFontWeight: 600,
          grid: true,
          gridStroke: "#eef1f5",
        },
      },
      style: { maxWidth: 42, radiusTopLeft: 6, radiusTopRight: 6 },
      tooltip: {
        items: [{ channel: "y", valueFormatter: (value) => `${value} lượt` }],
      },
    }),
    [chartData, chartPeriods],
  );

  const totalInspections = Number(summary.total) || 0;
  const passPercent =
    totalInspections === 0
      ? 0
      : ((Number(summary.pass_count) || 0) / totalInspections) * 100;
  const failPercent =
    totalInspections === 0
      ? 0
      : ((Number(summary.fail_count) || 0) / totalInspections) * 100;

  return (
    <div className="history-content">
      <Row
        className="history-card filter-card"
        gutter={[16, 12]}
        align="middle"
        style={{ marginInline: 0 }}
      >
        <Col xs={24} md={8}>
          <Flex align="center" gap={12} className="history-filter-field">
            <label className="field-label">Chọn ngày</label>
            <RangePicker
              className="date-range"
              value={dateRange}
              onChange={(value) => {
                setDateRange(value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
              format="DD-MM-YYYY"
              suffixIcon={<CalendarOutlined />}
            />
          </Flex>
        </Col>

        <Col xs={24} md={5}>
          <Flex align="center" gap={12} className="history-filter-field">
            <label className="field-label">Trạng thái</label>
            <Select
              className="status-select"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
              options={[
                { value: "all", label: "Tất cả" },
                { value: "PASS", label: "Pass" },
                { value: "FAIL", label: "Fail" },
              ]}
            />
          </Flex>
        </Col>
      </Row>

      <div className="history-card table-card">
        <div className="history-table-viewport" ref={tableViewportRef}>
          <Table
            className="history-fit-table"
            tableLayout="fixed"
            rowKey="id"
            columns={columns}
            dataSource={tableRows}
            pagination={false}
            loading={loading}
            scroll={{ y: tableBodyHeight }}
            locale={{ emptyText: error || "Không có dữ liệu lịch sử." }}
          />
        </div>
        <Pagination
          className="history-pagination"
          {...{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            size: "small",
            showSizeChanger: true,
            showLessItems: true,
            showTotal: (total) => `Tổng số ${total} bản ghi`,
            pageSizeOptions: [50, 100, 200, 500, 1000],
            locale: { items_per_page: "/ trang" },
            onChange: (nextPage, nextPageSize) => {
              if (nextPageSize !== pagination.pageSize) {
                setPagination((current) => ({
                  ...current,
                  page: 1,
                  pageSize: nextPageSize,
                }));
                return;
              }
              setPagination((current) => ({
                ...current,
                page: nextPage,
              }));
            },
          }}
        />
      </div>

      <Row
        gutter={[0, 16]}
        className="history-bottom"
        wrap={true}
        align="stretch"
      >
        <Col xs={24} lg={14} xl={15} className="trend-col">
          <div className="history-card trend-card">
            <Flex justify="space-between" align="flex-start" gap={12}>
              <div className="trend-title">
                <h3>Xu hướng vận hành</h3>
                <span>Thống kê thời gian vận hành</span>
              </div>

              <Space size={16}>
                <Flex align="center" gap={6}>
                  <span className="legend-dot pass" />
                  <span className="legend-text">THÀNH CÔNG (PASS)</span>
                </Flex>

                <Flex align="center" gap={6}>
                  <span className="legend-dot fail" />
                  <span className="legend-text">LỖI (FAIL)</span>
                </Flex>
              </Space>
            </Flex>

            <div className="trend-chart">
              <Column {...chartConfig} />
            </div>
          </div>
        </Col>

        <Col xs={24} lg={10} xl={9} className="summary-col">
          <Flex vertical gap={8} className="summary-panel">
            <div className="history-card summary-card total-card">
              <Flex
                justify="space-between"
                align="center"
                style={{ height: "100%" }}
              >
                <div>
                  <span className="summary-label">TỔNG LƯỢT KIỂM TRA</span>

                  <Flex align="baseline" gap={10} className="total-value">
                    <strong>{totalInspections.toLocaleString("en-US")}</strong>
                  </Flex>
                </div>

                <Flex align="center" justify="center" className="summary-icon">
                  <UnorderedListOutlined />
                </Flex>
              </Flex>
            </div>

            <ProgressCard
              title="TỈ LỆ ĐẠT (OK)"
              value={`${passPercent.toFixed(2)}%`}
              percent={passPercent}
              type="ok"
              color="#4fc087"
            />

            <ProgressCard
              title="TỈ LỆ LỖI"
              value={`${failPercent.toFixed(2)}%`}
              percent={failPercent}
              type="fail"
              color="#ef3b67"
            />
          </Flex>
        </Col>
      </Row>
    </div>
  );
}

function ProgressCard({ title, value, percent, type, color }) {
  return (
    <div className="history-card summary-card progress-card">
      <Flex justify="space-between" align="center" className="progress-header">
        <span>{title}</span>
        <strong className={`${type}-value`}>{value}</strong>
      </Flex>

      <Progress
        percent={percent}
        showInfo={false}
        strokeColor={color}
        strokeLinecap="round"
        style={{ width: "100%", display: "block", margin: 0 }}
      />
    </div>
  );
}

export default HistoryPage;
