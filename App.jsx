import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell
} from 'recharts';
import { 
  Filter, 
  Calendar, 
  RefreshCw, 
  TrendingUp, 
  ShoppingBag, 
  ShoppingCart, 
  Eye, 
  AlertTriangle,
  FileText,
  BarChart3,
  Layers,
  ArrowRight,
  TrendingDown
} from 'lucide-react';

const API_BASE_URL = "https://e-commerce-funnel-analytics-production.up.railway.app";

export default function App() {
  // Date states (default to past 30 days)
  const getPastDateStr = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(getPastDateStr(30));
  const [endDate, setEndDate] = useState(getTodayStr());
  
  // Filter options
  const [availableFilters, setAvailableFilters] = useState({ brands: [], category_codes: [] });
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Segment analysis state
  const [segmentBy, setSegmentBy] = useState('brand');
  
  // Raw API response states
  const [funnelData, setFunnelData] = useState(null);
  const [dropoffData, setDropoffData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [segmentData, setSegmentData] = useState(null);
  
  // Status states
  const [loading, setLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch filter dropdown options on mount
  useEffect(() => {
    fetchFilters();
  }, []);

  // Re-fetch dashboard data when filters change
  useEffect(() => {
    fetchDashboardData();
  }, [startDate, endDate, selectedBrand, selectedCategory, segmentBy]);

  const fetchFilters = async () => {
    setFiltersLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/funnel/filters`);
      if (!response.ok) throw new Error('Failed to load filter options');
      const data = await response.json();
      setAvailableFilters(data);
    } catch (err) {
      console.error('Error fetching filter lists:', err);
    } finally {
      setFiltersLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Build common query parameters
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (selectedBrand) params.append('brand', selectedBrand);
      if (selectedCategory) params.append('category_code', selectedCategory);

      // Fetch from endpoints in parallel
      const [funnelRes, dropoffRes, trendRes, segmentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/funnel?${params.toString()}`),
        fetch(`${API_BASE_URL}/funnel/dropoff?${params.toString()}`),
        fetch(`${API_BASE_URL}/funnel/trend?${params.toString()}`),
        fetch(`${API_BASE_URL}/funnel/segment?by=${segmentBy}&start_date=${startDate || ''}&end_date=${endDate || ''}`)
      ]);

      if (!funnelRes.ok || !dropoffRes.ok || !trendRes.ok || !segmentRes.ok) {
        throw new Error('One or more analytics services failed to respond correctly.');
      }

      const funnel = await funnelRes.json();
      const dropoff = await dropoffRes.json();
      const trend = await trendRes.json();
      const segment = await segmentRes.json();

      setFunnelData(funnel);
      setDropoffData(dropoff);
      setTrendData(trend);
      setSegmentData(segment);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while loading data.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setStartDate(getPastDateStr(30));
    setEndDate(getTodayStr());
    setSelectedBrand('');
    setSelectedCategory('');
  };

  // Helper values for KPI Cards
  const totalSessions = funnelData?.total_sessions || 0;
  const viewSessions = funnelData?.steps[0]?.count || 0;
  const cartSessions = funnelData?.steps[1]?.count || 0;
  const purchaseSessions = funnelData?.steps[2]?.count || 0;

  const viewToCartConv = funnelData?.steps[1]?.conversion_rate || 0;
  const cartToPurchaseConv = funnelData?.steps[2]?.step_conversion_rate || 0;
  const overallConv = funnelData?.steps[2]?.conversion_rate || 0;

  // Custom tooltips for Recharts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-darkCard border border-darkBorder p-3 rounded-lg shadow-xl">
          <p className="text-gray-400 font-semibold mb-1">{label}</p>
          {payload.map((item, idx) => (
            <p key={idx} style={{ color: item.color }} className="text-sm">
              {item.name}: <span className="font-bold">{item.value.toLocaleString()}</span>
              {item.unit && ` ${item.unit}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      {/* HEADER */}
      <header className="glass-panel sticky top-0 z-50 border-b border-darkBorder px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="p-2 bg-gradient-to-tr from-brandIndigo to-brandViolet rounded-lg">
              <Layers className="h-5 w-5 text-white" />
            </span>
            <span className="gradient-text font-black">Siya Funnel</span>
            <span className="text-gray-400 font-normal">| E-Commerce Funnel Analysis</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Analyzing eCommerce event metrics (View → Add to Cart → Purchase) per unique session
          </p>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-darkCard hover:bg-darkCardHover border border-darkBorder rounded-lg text-sm text-gray-300 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button 
            onClick={handleResetFilters}
            className="text-sm text-gray-400 hover:text-white underline decoration-dashed underline-offset-4"
          >
            Reset All
          </button>
        </div>
      </header>

      {/* DASHBOARD CONTENT CONTAINER */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* FILTERS PANEL */}
        <section className="glass-panel p-5 rounded-2xl border border-darkBorder grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Start Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-brandIndigo" />
              Start Date
            </label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#111827] border border-darkBorder text-gray-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brandIndigo transition"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-brandIndigo" />
              End Date
            </label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#111827] border border-darkBorder text-gray-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brandIndigo transition"
            />
          </div>

          {/* Brand Filter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-brandViolet" />
              Brand
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              disabled={filtersLoading}
              className="w-full bg-[#111827] border border-darkBorder text-gray-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brandViolet transition disabled:opacity-50"
            >
              <option value="">All Brands</option>
              {availableFilters.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-brandViolet" />
              Category Code
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={filtersLoading}
              className="w-full bg-[#111827] border border-darkBorder text-gray-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brandViolet transition disabled:opacity-50"
            >
              <option value="">All Categories</option>
              {availableFilters.category_codes.map((cc) => (
                <option key={cc} value={cc}>{cc}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ERROR STATE */}
        {error && (
          <div className="bg-red-950/40 border border-red-500/50 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-200 text-sm">Dashboard Error</h4>
              <p className="text-xs text-red-300 mt-0.5">{error}</p>
              <button 
                onClick={fetchDashboardData} 
                className="mt-2 text-xs font-semibold text-red-400 hover:text-red-300 underline"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* KPI CARDS SECTION */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Unique Sessions */}
          <div className="glass-panel p-5 rounded-2xl border border-darkBorder flex items-center justify-between hover:border-brandIndigo/40 transition group">
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-400">Total Unique Sessions</span>
              <h3 className="text-2xl font-bold tracking-tight">
                {loading ? (
                  <div className="h-8 w-24 bg-darkBorder animate-pulse rounded"></div>
                ) : (
                  totalSessions.toLocaleString()
                )}
              </h3>
              <p className="text-[10px] text-gray-400">Count of unique user sessions</p>
            </div>
            <div className="p-3 bg-brandIndigo/10 group-hover:bg-brandIndigo/20 text-brandIndigo rounded-xl transition">
              <Layers className="h-6 w-6" />
            </div>
          </div>

          {/* Card 2: View-to-Cart Conversion */}
          <div className="glass-panel p-5 rounded-2xl border border-darkBorder flex items-center justify-between hover:border-brandViolet/40 transition group">
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-400">View → Cart Rate</span>
              <h3 className="text-2xl font-bold tracking-tight text-brandViolet">
                {loading ? (
                  <div className="h-8 w-24 bg-darkBorder animate-pulse rounded"></div>
                ) : (
                  `${viewToCartConv}%`
                )}
              </h3>
              <p className="text-[10px] text-gray-400">
                {!loading && `${cartSessions.toLocaleString()} of ${viewSessions.toLocaleString()} sessions`}
              </p>
            </div>
            <div className="p-3 bg-brandViolet/10 group-hover:bg-brandViolet/20 text-brandViolet rounded-xl transition">
              <ShoppingCart className="h-6 w-6" />
            </div>
          </div>

          {/* Card 3: Cart-to-Purchase Conversion */}
          <div className="glass-panel p-5 rounded-2xl border border-darkBorder flex items-center justify-between hover:border-brandEmerald/40 transition group">
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-400">Cart → Purchase Rate</span>
              <h3 className="text-2xl font-bold tracking-tight text-brandEmerald">
                {loading ? (
                  <div className="h-8 w-24 bg-darkBorder animate-pulse rounded"></div>
                ) : (
                  `${cartToPurchaseConv}%`
                )}
              </h3>
              <p className="text-[10px] text-gray-400">
                {!loading && `${purchaseSessions.toLocaleString()} of ${cartSessions.toLocaleString()} sessions`}
              </p>
            </div>
            <div className="p-3 bg-brandEmerald/10 group-hover:bg-brandEmerald/20 text-brandEmerald rounded-xl transition">
              <ShoppingBag className="h-6 w-6" />
            </div>
          </div>

          {/* Card 4: Overall Conversion */}
          <div className="glass-panel p-5 rounded-2xl border border-darkBorder flex items-center justify-between hover:border-brandRose/40 transition group">
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-400">Overall Funnel Conv.</span>
              <h3 className="text-2xl font-bold tracking-tight text-brandRose">
                {loading ? (
                  <div className="h-8 w-24 bg-darkBorder animate-pulse rounded"></div>
                ) : (
                  `${overallConv}%`
                )}
              </h3>
              <p className="text-[10px] text-gray-400">
                {!loading && `${purchaseSessions.toLocaleString()} of ${viewSessions.toLocaleString()} sessions`}
              </p>
            </div>
            <div className="p-3 bg-brandRose/10 group-hover:bg-brandRose/20 text-brandRose rounded-xl transition">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </section>

        {/* VISUAL FUNNEL FLOW (NOT JUST CHARTS) */}
        <section className="glass-panel p-6 rounded-2xl border border-darkBorder">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-5 flex items-center gap-2">
            <Layers className="h-4 w-4 text-brandIndigo" />
            Funnel Stage Progression Flow
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-5 items-center gap-3">
            {/* Step 1: Views */}
            <div className="bg-[#111827] border border-darkBorder rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden h-28">
              <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-brandIndigo"></div>
              <Eye className="h-5 w-5 text-brandIndigo mb-1" />
              <span className="text-xs text-gray-400">1. Product Views</span>
              <span className="text-xl font-bold mt-1 text-gray-100">
                {loading ? "..." : viewSessions.toLocaleString()}
              </span>
              <span className="text-[10px] text-brandIndigo bg-brandIndigo/10 px-2 py-0.5 rounded-full mt-1.5 font-medium">
                100% (Baseline)
              </span>
            </div>

            {/* View to Cart Transition Arrow */}
            <div className="flex flex-col items-center justify-center py-2">
              <ArrowRight className="h-5 w-5 text-gray-500 hidden md:block" />
              {funnelData && (
                <div className="text-center">
                  <span className="text-xs font-semibold text-brandViolet">{viewToCartConv}%</span>
                  <p className="text-[9px] text-gray-500">Viewed to Cart</p>
                </div>
              )}
            </div>

            {/* Step 2: Carts */}
            <div className="bg-[#111827] border border-darkBorder rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden h-28">
              <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-brandViolet"></div>
              <ShoppingCart className="h-5 w-5 text-brandViolet mb-1" />
              <span className="text-xs text-gray-400">2. Add to Cart</span>
              <span className="text-xl font-bold mt-1 text-gray-100">
                {loading ? "..." : cartSessions.toLocaleString()}
              </span>
              <span className="text-[10px] text-brandViolet bg-brandViolet/10 px-2 py-0.5 rounded-full mt-1.5 font-medium">
                {viewToCartConv}% conversion
              </span>
            </div>

            {/* Cart to Purchase Transition Arrow */}
            <div className="flex flex-col items-center justify-center py-2">
              <ArrowRight className="h-5 w-5 text-gray-500 hidden md:block" />
              {funnelData && (
                <div className="text-center">
                  <span className="text-xs font-semibold text-brandEmerald">{cartToPurchaseConv}%</span>
                  <p className="text-[9px] text-gray-500">Carts Purchased</p>
                </div>
              )}
            </div>

            {/* Step 3: Purchases */}
            <div className="bg-[#111827] border border-darkBorder rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden h-28">
              <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-brandEmerald"></div>
              <ShoppingBag className="h-5 w-5 text-brandEmerald mb-1" />
              <span className="text-xs text-gray-400">3. Purchases</span>
              <span className="text-xl font-bold mt-1 text-gray-100">
                {loading ? "..." : purchaseSessions.toLocaleString()}
              </span>
              <span className="text-[10px] text-brandEmerald bg-brandEmerald/10 px-2 py-0.5 rounded-full mt-1.5 font-medium">
                {overallConv}% overall conversion
              </span>
            </div>
          </div>
        </section>

        {/* CHARTS ROW (FUNNEL & DROPOFF) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* FUNNEL BAR CHART */}
          <section className="glass-panel p-5 rounded-2xl border border-darkBorder flex flex-col h-[380px]">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-brandIndigo" />
                Funnel Conversion Step Chart
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Sessions breakdown by funnel event types</p>
            </div>
            
            <div className="flex-1 w-full relative min-h-[250px]">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[#111827]/40 rounded-xl">
                  <RefreshCw className="h-8 w-8 text-brandIndigo animate-spin" />
                </div>
              ) : funnelData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={funnelData.steps}
                    margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                    layout="vertical"
                  >
                    <defs>
                      <linearGradient id="funnelGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                    <XAxis type="number" stroke="#9ca3af" tickLine={false} />
                    <YAxis dataKey="display_name" type="category" stroke="#9ca3af" width={100} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="url(#funnelGrad)" radius={[0, 6, 6, 0]}>
                      {funnelData.steps.map((entry, index) => {
                        const colors = ['#6366f1', '#8b5cf6', '#10b981'];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                  No data available for the chosen filters.
                </div>
              )}
            </div>
          </section>

          {/* DROPOFF BAR CHART */}
          <section className="glass-panel p-5 rounded-2xl border border-darkBorder flex flex-col h-[380px]">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-brandRose" />
                Consecutive Funnel Drop-off Rate
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Percentage loss of sessions between consecutive steps</p>
            </div>
            
            <div className="flex-1 w-full relative min-h-[250px]">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[#111827]/40 rounded-xl">
                  <RefreshCw className="h-8 w-8 text-brandRose animate-spin" />
                </div>
              ) : dropoffData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dropoffData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis dataKey="stage" stroke="#9ca3af" tickLine={false} />
                    <YAxis stroke="#9ca3af" tickFormatter={(v) => `${v}%`} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="dropoff_rate" name="Dropoff Rate (%)" fill="#f43f5e" radius={[6, 6, 0, 0]}>
                      {dropoffData.map((entry, index) => {
                        const colors = ['#f43f5e', '#ef4444'];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                  No drop-off records found.
                </div>
              )}
            </div>
          </section>

        </div>

        {/* TRENDS LINE CHART */}
        <section className="glass-panel p-5 rounded-2xl border border-darkBorder flex flex-col h-[380px]">
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brandEmerald" />
              Daily Funnel Conversion Trend Rates
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Fluctuations in conversion rates over the selected date range</p>
          </div>
          
          <div className="flex-1 w-full relative min-h-[250px]">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#111827]/40 rounded-xl">
                <RefreshCw className="h-8 w-8 text-brandEmerald animate-spin" />
              </div>
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  margin={{ top: 15, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke="#9ca3af" tickLine={false} />
                  <YAxis stroke="#9ca3af" tickFormatter={(v) => `${v}%`} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <Line 
                    type="monotone" 
                    dataKey="cart_conversion_rate" 
                    name="View-to-Cart (%)" 
                    stroke="#8b5cf6" 
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="purchase_conversion_rate" 
                    name="View-to-Purchase (Overall %)" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                No trend details available. Try expanding your date range selection.
              </div>
            )}
          </div>
        </section>

        {/* SEGMENT BREAKDOWN COMPONENT */}
        <section className="glass-panel p-5 rounded-2xl border border-darkBorder">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Filter className="h-4 w-4 text-brandViolet" />
                Funnel Segment Demographics
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Top-performing segments ordered by view volume</p>
            </div>
            
            {/* Segment Toggle */}
            <div className="flex bg-[#111827] border border-darkBorder p-1 rounded-lg">
              <button
                onClick={() => setSegmentBy('brand')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${segmentBy === 'brand' ? 'bg-brandViolet text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Segment by Brand
              </button>
              <button
                onClick={() => setSegmentBy('category_code')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${segmentBy === 'category_code' ? 'bg-brandViolet text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Segment by Category
              </button>
            </div>
          </div>

          {/* Segment Details Table */}
          <div className="overflow-x-auto rounded-xl border border-darkBorder">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#111827] text-gray-400 text-xs font-semibold uppercase">
                <tr>
                  <th className="px-6 py-4">Segment Value</th>
                  <th className="px-6 py-4 text-right">Views</th>
                  <th className="px-6 py-4 text-right">Carts (Conv. %)</th>
                  <th className="px-6 py-4 text-right">Purchases (Conv. %)</th>
                  <th className="px-6 py-4 text-right">Overall Conv. %</th>
                  <th className="px-6 py-4">Sample Size & Significance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-darkBorder bg-[#0e1423]/40">
                {loading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 bg-darkBorder rounded w-36"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-darkBorder rounded w-16 ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-darkBorder rounded w-24 ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-darkBorder rounded w-24 ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-darkBorder rounded w-16 ml-auto"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-darkBorder rounded w-48"></div></td>
                    </tr>
                  ))
                ) : segmentData && segmentData.segments.length > 0 ? (
                  segmentData.segments.map((seg, idx) => {
                    const viewC = seg.steps[0].count;
                    const cartC = seg.steps[1].count;
                    const cartRate = seg.steps[1].conversion_rate;
                    const purchaseC = seg.steps[2].count;
                    const purchaseRate = seg.steps[2].step_conversion_rate;
                    const overall = seg.steps[2].conversion_rate;
                    
                    // Style for significance pill
                    const isSig = seg.sample_size_note.includes("Significant");
                    const isMod = seg.sample_size_note.includes("Moderate");
                    
                    const pillColor = isSig 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : isMod 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                    // Interaction: allow clicking segment value to apply it to filter!
                    const isClickable = segmentBy === 'brand' || segmentBy === 'category_code';
                    const handleSelectSegment = () => {
                      if (segmentBy === 'brand') {
                        setSelectedBrand(seg.segment_value);
                      } else {
                        setSelectedCategory(seg.segment_value);
                      }
                      // Scroll to filters
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    };

                    return (
                      <tr 
                        key={idx} 
                        onClick={handleSelectSegment}
                        className="hover:bg-[#172237]/30 transition duration-150 cursor-pointer"
                        title="Click to apply this segment filter globally"
                      >
                        <td className="px-6 py-4 font-semibold text-gray-200">
                          {seg.segment_value}
                        </td>
                        <td className="px-6 py-4 text-right font-mono">
                          {viewC.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right font-mono">
                          {cartC.toLocaleString()}{" "}
                          <span className="text-xs text-brandViolet font-semibold">({cartRate}%)</span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono">
                          {purchaseC.toLocaleString()}{" "}
                          <span className="text-xs text-brandEmerald font-semibold">({purchaseRate}%)</span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-brandRose">
                          {overall}%
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-gray-400">n = {seg.sample_size.toLocaleString()}</span>
                            <span className={`text-[10px] w-fit px-2 py-0.5 rounded-full border ${pillColor}`}>
                              {seg.sample_size_note}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">
                      No segments matching the selected filters were found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="text-[10px] text-gray-500 mt-3 flex items-center gap-1">
            <InfoIcon className="h-3 w-3 shrink-0" />
            Tip: You can click on any segment row in the table above to automatically apply it as a global filter at the top.
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-darkBorder py-6 text-center text-xs text-gray-500">
        <p>© 2026 Siya Funnel. Built with FastAPI, PostgreSQL, React, and Recharts.</p>
      </footer>
    </div>
  );
}

// Simple dynamic info icon
function InfoIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
