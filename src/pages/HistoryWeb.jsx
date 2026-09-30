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
  CloseOutlined,
  DownloadOutlined,
  EyeOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import {
  Button,
  Col,
  DatePicker,
  Descriptions,
  Flex,
  Modal,
  Pagination,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { Column } from "@ant-design/charts";
import dayjs from "dayjs";
import { API_BASE_URL, getRequest } from "../services/request";

const { RangePicker } = DatePicker;

function HistoryWeb({ onViewDetail }) {
  const chartPeriods = useMemo(
    () => ["00-04h", "04-08h", "08-12h", "12-16h", "16-20h", "20-24h"],
    [],
  );

  const [allMeasurements, setAllMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState(null);
  const [historySummary, setHistorySummary] = useState({
    total: 0,
    pass_count: 0,
    fail_count: 0,
    chart: [],
  });
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [detailModalData, setDetailModalData] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const tableViewportRef = useRef(null);
  const [tableBodyHeight, setTableBodyHeight] = useState(216);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportDateRange, setExportDateRange] = useState(null);
  const [exportStatus, setExportStatus] = useState("all");
  const [exportLoading, setExportLoading] = useState(false);

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
        tableParams.set("page", String(page));
        tableParams.set("pageSize", String(pageSize));

        const response = await getRequest(
          `/api/history?${tableParams.toString()}`,
        );

        if (!alive) return;

        setAllMeasurements(response?.items || []);
        setTotal(Number(response?.total) || 0);
      } catch (loadError) {
        console.error("HistoryWeb load error:", loadError);

        if (alive) {
          setAllMeasurements([]);
          setTotal(0);
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
  }, [page, pageSize, statusFilter, dateRange]);

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
      cycleTime: item.cycleTime,
      data: item.data,
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
        if (onViewDetail) {
          onViewDetail(detail);
        } else {
          setDetailModalData(detail || record);
          setDetailModalOpen(true);
        }
      } catch (detailError) {
        console.error("History detail load error:", detailError);
        setError("Không thể tải dữ liệu chi tiết lịch sử.");
      } finally {
        setDetailLoadingId(null);
      }
    },
    [onViewDetail],
  );

  const handleExportExcel = useCallback(async () => {
    setExportLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (exportStatus && exportStatus !== "all") {
        params.set("status", exportStatus);
      }

      if (exportDateRange?.[0]) {
        params.set("fromDate", exportDateRange[0].format("YYYY-MM-DD"));
      }

      if (exportDateRange?.[1]) {
        params.set("toDate", exportDateRange[1].format("YYYY-MM-DD"));
      }

      const query = params.toString();
      const response = await fetch(
        `${API_BASE_URL}/api/history/export${query ? `?${query}` : ""}`,
      );

      if (!response.ok) {
        let message = "Không thể xuất dữ liệu Excel.";

        try {
          const payload = await response.json();
          if (payload?.message) message = payload.message;
        } catch {
          // The export endpoint may fail before returning JSON.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1].replace(/"/g, ""))
        : `lich_su_do_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExportModalOpen(false);
    } catch (exportError) {
      console.error("History export error:", exportError);
      setError(exportError.message || "Không thể xuất dữ liệu Excel.");
    } finally {
      setExportLoading(false);
    }
  }, [exportDateRange, exportStatus]);

  const columns = useMemo(
    () => [
      {
        title: "STT",
        key: "index",
        width: "8%",
        align: "center",
        render: (_, __, index) => (page - 1) * pageSize + index + 1,
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
    [detailLoadingId, handleViewDetail, page, pageSize],
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
        justify="space-between"
        style={{ marginInline: 0 }}
      >
        <Col flex="auto">
          <Flex align="center" gap={20}>
            <Flex align="center" gap={12} className="history-filter-field">
              <label className="field-label">Chọn ngày</label>

              <RangePicker
                className="date-range"
                value={dateRange}
                onChange={(value) => {
                  setDateRange(value);
                  setPage(1);
                }}
                allowClear
                format="DD-MM-YYYY"
                suffixIcon={<CalendarOutlined />}
              />
            </Flex>

            <Flex align="center" gap={12} className="history-filter-field">
              <label className="field-label">Trạng thái</label>

              <Select
                className="status-select"
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "Tất cả" },
                  { value: "PASS", label: "Pass" },
                  { value: "FAIL", label: "Fail" },
                ]}
              />
            </Flex>
          </Flex>
        </Col>

        <Col flex="none">
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            className="export-button"
            onClick={() => {
              // Mặc định lấy điều kiện đang lọc trên màn hình
              setExportDateRange(dateRange);
              setExportStatus(statusFilter);
              setExportModalOpen(true);
            }}
          >
            Xuất dữ liệu
          </Button>
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
          current={page}
          pageSize={pageSize}
          total={total}
          size="small"
          showSizeChanger={true}
          showLessItems={true}
          showTotal={(total) => `Tổng số ${total} bản ghi`}
          pageSizeOptions={[50, 100, 200, 500, 1000]}
          locale={{ items_per_page: "/ trang" }}
          onChange={(nextPage, nextPageSize) => {
            if (nextPageSize !== pageSize) {
              setPageSize(nextPageSize);
              setPage(1);
              return;
            }
            setPage(nextPage);
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

      <Modal
        title={
          <Flex align="center" gap={10}>
            <span>Chi tiết kiểm tra rò rỉ khí</span>
            {detailModalData && (
              <Tag
                className={`status-tag ${
                  String(detailModalData.status || "").toLowerCase() === "pass"
                    ? "pass"
                    : "fail"
                }`}
              >
                {String(detailModalData.status || "").toUpperCase()}
              </Tag>
            )}
          </Flex>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={() => setDetailModalOpen(false)}
          >
            Đóng
          </Button>,
        ]}
        width={600}
      >
        {detailModalData && (
          <Descriptions
            column={2}
            bordered
            size="small"
            style={{ marginTop: 16 }}
          >
            <Descriptions.Item label="Mã mâm xe" span={2}>
              <strong style={{ color: "#2563eb" }}>
                {detailModalData.trayCode || detailModalData.wheelCode || "--"}
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag
                className={`status-tag ${
                  String(detailModalData.status || "").toLowerCase() === "pass"
                    ? "pass"
                    : "fail"
                }`}
              >
                {detailModalData.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian chu kỳ">
              {detailModalData.cycleTime
                ? `${detailModalData.cycleTime}s`
                : "--"}
            </Descriptions.Item>
            <Descriptions.Item label="Áp suất kiểm tra">
              <span className="pressure-text">
                {detailModalData.actualPressure ??
                  detailModalData.pressure ??
                  "--"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Mức độ rò rỉ">
              <span className="leak-value">
                {detailModalData.actualLeak ?? detailModalData.leakage ?? "--"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Bắt đầu">
              {detailModalData.startTime
                ? dayjs(detailModalData.startTime).format("DD/MM/YYYY HH:mm:ss")
                : "--"}
            </Descriptions.Item>
            <Descriptions.Item label="Kết thúc">
              {detailModalData.endTime
                ? dayjs(detailModalData.endTime).format("DD/MM/YYYY HH:mm:ss")
                : "--"}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
      <Modal
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        footer={null}
        centered
        width={500}
        closable={false}
        className="export-history-modal"
      >
        <div className="export-history">
          {/* HEADER */}
          <div className="export-history__header">
            <div className="export-history__header-left">
              <div className="export-history__icon">
                <DownloadOutlined />
              </div>

              <div>
                <div className="export-history__title">Xuất lịch sử đo</div>

                <div className="export-history__subtitle">
                  Tải xuống báo cáo lịch sử đo
                </div>
              </div>
            </div>

            <button
              type="button"
              className="export-history__close"
              onClick={() => setExportModalOpen(false)}
            >
              <CloseOutlined />
            </button>
          </div>

          {/* BODY */}
          <div className="export-history__body">
            {/* DATE */}
            <div className="export-history__group">
              <div className="export-history__label">KHOẢNG THỜI GIAN</div>

              <div className="export-history__dates">
                <DatePicker
                  value={exportDateRange?.[0] || null}
                  format="DD/MM/YYYY"
                  placeholder="Ngày bắt đầu"
                  allowClear
                  suffixIcon={<CalendarOutlined />}
                  onChange={(value) => {
                    const nextRange = [value, exportDateRange?.[1] || null];
                    setExportDateRange(
                      nextRange[0] || nextRange[1] ? nextRange : null,
                    );
                  }}
                />

                <DatePicker
                  value={exportDateRange?.[1] || null}
                  format="DD/MM/YYYY"
                  placeholder="Ngày kết thúc"
                  allowClear
                  suffixIcon={<CalendarOutlined />}
                  onChange={(value) => {
                    const nextRange = [exportDateRange?.[0] || null, value];
                    setExportDateRange(
                      nextRange[0] || nextRange[1] ? nextRange : null,
                    );
                  }}
                />
              </div>
            </div>

            {/* STATUS */}
            <div className="export-history__group">
              <div className="export-history__label">TRẠNG THÁI KIỂM TRA</div>

              <div className="export-history__status">
                <button
                  type="button"
                  className={`export-history__status-item ${
                    exportStatus === "all" ? "active" : ""
                  }`}
                  onClick={() => setExportStatus("all")}
                >
                  Tất cả
                </button>

                <button
                  type="button"
                  className={`export-history__status-item ${
                    exportStatus === "PASS" ? "active" : ""
                  }`}
                  onClick={() => setExportStatus("PASS")}
                >
                  Pass (Đạt)
                </button>

                <button
                  type="button"
                  className={`export-history__status-item ${
                    exportStatus === "FAIL" ? "active" : ""
                  }`}
                  onClick={() => setExportStatus("FAIL")}
                >
                  Fail (Lỗi)
                </button>
              </div>
            </div>

            {/* FORMAT */}
            <div className="export-history__group">
              <div className="export-history__label">ĐỊNH DẠNG XUẤT</div>

              <div className="export-history__format">
                <span className="export-history__radio">
                  <span />
                </span>

                <span>Excel (.xlsx)</span>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="export-history__footer">
            <Button
              className="export-history__cancel"
              onClick={() => setExportModalOpen(false)}
            >
              Hủy
            </Button>

            <Button
              // type="primary"
              icon={<DownloadOutlined />}
              className="export-history__submit"
              loading={exportLoading}
              onClick={handleExportExcel}
            >
              Xuất dữ liệu
            </Button>
          </div>
        </div>
      </Modal>
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

export default HistoryWeb;
