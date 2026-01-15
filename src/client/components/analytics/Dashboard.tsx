import React, { useState, useEffect } from 'react';
import {
  getOverviewStats,
  getModelStats,
  getKeyStats,
  // getAssetStats,
  getTTFBStats,
  getCacheStats,
  // getErrorStats,
  getTimeSeriesStats,
  getRequestLogs,
} from '@client/services/analyticsService';
import type {
  RequestLog,
  OverviewStats,
  ModelStats,
  KeyStats,
  TTFBStats,
  CacheStats,
  TimeSeriesStats,
} from '@shared/types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  // Legend,
  LineChart,
  Line,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Activity,
  Zap,
  Clock,
  Database,
  // AlertCircle,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

const Card = ({
  title,
  value,
  sub,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  isLoading?: boolean;
}) => (
  <div className="bg-[#0a0a0a] border border-[#262626] p-6 rounded-xl">
    <div className="flex justify-between items-start mb-4">
      <div>
        <p className="text-sm text-gray-400 font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-white mt-1">
          {isLoading ? '...' : value}
        </h3>
      </div>
      <div className="p-2 bg-[#1a1a1a] rounded-lg border border-[#333]">
        <Icon className="w-5 h-5 text-indigo-400" />
      </div>
    </div>
    <p className="text-xs text-gray-500">{sub}</p>
  </div>
);

const COLORS = ['#4f46e5', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b'];


export const Dashboard: React.FC = () => {
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null as any);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [keyStats, setKeyStats] = useState<KeyStats[]>([]);
  const [ttfbStats, setTtfbStats] = useState<TTFBStats | null>(null as any);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null as any);
  const [timeSeriesStats, setTimeSeriesStats] = useState<TimeSeriesStats[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Key trend chart state - store trend data for all keys
  const [allKeysTimeSeries, setAllKeysTimeSeries] = useState<Record<string, TimeSeriesStats[]>>({});
  const [isLoadingKeyTrend, setIsLoadingKeyTrend] = useState(false);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [
          overviewData,
          modelData,
          keyData,
          // assetData,
          ttfbData,
          cacheData,
          timeSeriesData,
          logsData,
        ] = await Promise.all([
          getOverviewStats(),
          getModelStats(),
          getKeyStats(),
          // getAssetStats(),
          getTTFBStats(),
          getCacheStats(),
          getTimeSeriesStats(7),
          getRequestLogs({ limit: 20 }),
        ]);

        setOverviewStats(overviewData);
        setModelStats(modelData);
        setKeyStats(keyData);
        // setAssetStats(assetData);
        setTtfbStats(ttfbData);
        setCacheStats(cacheData);
        setTimeSeriesStats(timeSeriesData);
        setLogs(logsData);

        // Load trend data for all API keys
        if (keyData.length > 0) {
          setIsLoadingKeyTrend(true);
          const trendDataPromises = keyData.map(async (key) => {
            try {
              const trend = await getTimeSeriesStats(7, key.keyId);
              return { keyId: key.keyId, trend };
            } catch (error) {
              console.error(`Failed to load trend for key ${key.keyId}:`, error);
              return { keyId: key.keyId, trend: [] };
            }
          });

          const results = await Promise.all(trendDataPromises);
          const trendDataMap: Record<string, TimeSeriesStats[]> = {};
          for (const result of results) {
            trendDataMap[result.keyId] = result.trend;
          }
          setAllKeysTimeSeries(trendDataMap);
          setIsLoadingKeyTrend(false);
        }
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatLatency = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(0)}ms`;
  };

  const chartData = timeSeriesStats.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    tokens: item.totalTokens,
    requests: item.requestCount,
    latency: item.avgLatency,
  }));

  // Combined API key trend chart data - merge all keys' data into single chart
  // Get all unique dates from all keys' trend data
  const allDates = new Set<string>();
  for (const keyId of Object.keys(allKeysTimeSeries)) {
    const trend = allKeysTimeSeries[keyId];
    if (trend) {
      for (const item of trend) {
        allDates.add(item.date);
      }
    }
  }
  const sortedDates = Array.from(allDates).sort();

  // Build combined chart data where each date has token values for all keys
  const combinedKeyChartData = sortedDates.map((date) => {
    const dataPoint: Record<string, any> = {
      date: new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    };
    // Add token count for each key
    for (const keyId of Object.keys(allKeysTimeSeries)) {
      const trend = allKeysTimeSeries[keyId];
      if (trend) {
        const dayData = trend.find((t) => t.date === date);
        dataPoint[keyId] = dayData?.totalTokens || 0;
      } else {
        dataPoint[keyId] = 0;
      }
    }
    return dataPoint;
  });

  const modelChartData = modelStats.slice(0, 5).map((stat) => ({
    name: stat.model,
    requests: stat.requestCount,
    tokens: stat.totalTokens,
  }));

  const ttfbChartData = Object.entries(ttfbStats?.ranges || {}).map(
    ([range, count]) => ({
      range,
      count,
    })
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          title="Total Requests"
          value={overviewStats?.totalRequests.toLocaleString() || 0}
          sub="All time"
          icon={Zap}
          isLoading={isLoading}
        />
        <Card
          title="Total Tokens"
          value={formatNumber(overviewStats?.totalTokens || 0)}
          sub="From all requests"
          icon={Activity}
          isLoading={isLoading}
        />
        <Card
          title="Avg Latency"
          value={formatLatency(overviewStats?.avgLatency || 0)}
          sub="Response time"
          icon={TrendingUp}
          isLoading={isLoading}
        />
        <Card
          title="Avg TTFB"
          value={formatLatency(overviewStats?.avgTTFB || 0)}
          sub="Time to first byte"
          icon={Clock}
          isLoading={isLoading}
        />
      </div>

      {/* Token Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0a0a0a] border border-[#262626] p-6 rounded-xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm text-gray-400 font-medium">Prompt Tokens</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {isLoading ? '...' : formatNumber(overviewStats?.totalPromptTokens || 0)}
              </h3>
            </div>
            <div className="p-2 bg-[#1a1a1a] rounded-lg border border-[#333]">
              <ArrowUpRight className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-400 h-full transition-all duration-500"
                style={{ width: `${overviewStats?.promptRatio || 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 whitespace-nowrap">
              {overviewStats?.promptRatio?.toFixed(1) || 0}% of total
            </p>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-[#262626] p-6 rounded-xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm text-gray-400 font-medium">Completion Tokens</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {isLoading ? '...' : formatNumber(overviewStats?.totalCompletionTokens || 0)}
              </h3>
            </div>
            <div className="p-2 bg-[#1a1a1a] rounded-lg border border-[#333]">
              <ArrowDownRight className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full transition-all duration-500"
                style={{ width: `${overviewStats?.completionRatio || 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 whitespace-nowrap">
              {overviewStats?.completionRatio?.toFixed(1) || 0}% of total
            </p>
          </div>
        </div>
      </div>

      {/* Success Rate & Cost */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title="Success Rate"
          value={`${(overviewStats?.successRate ?? 0).toFixed(1)}%`}
          sub={`${(overviewStats?.errorRate ?? 0).toFixed(1)}% error rate`}
          icon={Shield}
          isLoading={isLoading}
        />
        <Card
          title="Est. Cost"
          value={`$${(overviewStats?.costEstimate || 0).toFixed(2)}`}
          sub="Based on token usage"
          icon={DollarSign}
          isLoading={isLoading}
        />
        <Card
          title="Cache Hit Rate"
          value={`${cacheStats?.hitRate.toFixed(1) || 0}%`}
          sub={`${formatNumber(cacheStats?.totalCachedTokens || 0)} cached tokens`}
          icon={Database}
          isLoading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Token Usage Trend */}
        <div className="lg:col-span-2 bg-[#0a0a0a] border border-[#262626] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            Token Usage Trend (7 days)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#525252"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#525252"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString()
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#171717',
                    borderColor: '#404040',
                    color: '#fff',
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#4f46e5"
                  fillOpacity={1}
                  fill="url(#colorTokens)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Distribution */}
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Model Distribution</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modelChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="requests"
                >
                  {modelChartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#171717',
                    borderColor: '#404040',
                    color: '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* TTFB Distribution & Model Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TTFB Distribution */}
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            TTFB Distribution (avg: {formatLatency(ttfbStats?.avgTTFB || 0)})
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ttfbChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis
                  dataKey="range"
                  stroke="#525252"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#262626' }}
                  contentStyle={{
                    backgroundColor: '#171717',
                    borderColor: '#404040',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Statistics Table */}
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Model Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#262626]">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Model</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Requests</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Total</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Prompt</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Completion</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Comp %</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {modelStats.slice(0, 5).map((stat) => (
                  <tr key={stat.model} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                    <td className="py-3 px-4 text-white font-medium">{stat.model}</td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {stat.requestCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {formatNumber(stat.totalTokens)}
                    </td>
                    <td className="py-3 px-4 text-right text-blue-300">
                      {formatNumber(stat.promptTokens)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-300">
                      {formatNumber(stat.completionTokens)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      <span className="text-xs">
                        {stat.completionRatio?.toFixed(1) || 0}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {formatLatency(stat.avgLatency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* API Key Statistics & Trend Chart */}
      {keyStats.length > 0 && (
        <>
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">API Key Statistics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#262626]">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Key Name</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Requests</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Tokens</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Avg Latency</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Avg TTFB</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Errors</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Error Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {keyStats.map((stat) => (
                    <tr key={stat.keyId} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                      <td className="py-3 px-4 text-white font-medium">{stat.keyName}</td>
                      <td className="py-3 px-4 text-right text-gray-300">
                        {stat.requestCount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-300">
                        {formatNumber(stat.totalTokens)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-300">
                        {formatLatency(stat.avgLatency)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-300">
                        {formatLatency(stat.avgTTFB)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-300">
                        {stat.errorCount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            stat.errorRate > 5
                              ? 'bg-red-900/30 text-red-400'
                              : 'bg-green-900/30 text-green-400'
                          }`}
                        >
                          {stat.errorRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* API Key Trend Chart - Combined */}
          {/* Only show trend chart if we have trend data for at least one key */}
          {Object.keys(allKeysTimeSeries).length > 0 && Object.values(allKeysTimeSeries).some(data => data.length > 0) && (
            <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">
                API Key Token Usage Trend (7 days)
              </h3>
              <div className="h-[300px] w-full">
                {isLoadingKeyTrend ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="text-gray-500">Loading trend data...</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={combinedKeyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#525252"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#525252"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString()
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#171717',
                          borderColor: '#404040',
                          color: '#fff',
                        }}
                        itemStyle={{ color: '#fff' }}
                      />
                      {keyStats.map((stat, index) => {
                        const color = COLORS[index % COLORS.length];
                        const keyData = allKeysTimeSeries[stat.keyId];
                        if (!keyData || keyData.length === 0) return null;
                        return (
                          <Line
                            key={stat.keyId}
                            type="monotone"
                            dataKey={stat.keyId}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ fill: color, r: 3 }}
                            activeDot={{ r: 5 }}
                            name={stat.keyName}
                            connectNulls={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-4">
                {keyStats.map((stat, index) => {
                  const color = COLORS[index % COLORS.length];
                  const keyData = allKeysTimeSeries[stat.keyId];
                  const hasData = keyData && keyData.length > 0;
                  return (
                    <div key={stat.keyId} className={`flex items-center gap-2 ${hasData ? 'opacity-100' : 'opacity-30'}`}>
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                      <span className="text-sm text-gray-400">{stat.keyName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recent Requests */}
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Recent Requests</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#262626]">
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Time</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Model</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Total</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium text-blue-400">Prompt</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium text-emerald-400">Comp</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Latency</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">TTFB</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Prompt</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 10).map((log) => (
                <tr key={log.id} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                  <td className="py-3 px-4 text-gray-300">
                    {new Date(log.timestamp * 1000).toLocaleTimeString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-white">{log.finalModel}</div>
                    {log.originalModel !== log.finalModel && (
                      <div className="text-xs text-gray-500">was: {log.originalModel}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        log.statusCode >= 200 && log.statusCode < 300
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-red-900/30 text-red-400'
                      }`}
                    >
                      {log.statusCode}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-300">
                    {formatNumber(log.totalTokens)}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-300">
                    {formatNumber(log.promptTokens)}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-300">
                    {formatNumber(log.completionTokens)}
                  </td>
                  <td className="py-3 px-4 text-gray-300">
                    {formatLatency(log.latencyMs)}
                  </td>
                  <td className="py-3 px-4 text-gray-300">
                    {log.timeToFirstByteMs ? formatLatency(log.timeToFirstByteMs) : '-'}
                  </td>
                  <td className="py-3 px-4 text-gray-400 max-w-md truncate">
                    {log.firstMessage || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
