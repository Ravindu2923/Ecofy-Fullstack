const ServiceRequest = require("../Model/ServiceRequestModel");

// GET /sla-analytics — Compute all SLA analytics from service requests
const getSLAAnalytics = async (req, res) => {
  try {
    const allRequests = await ServiceRequest.find().lean();
    const total = allRequests.length;

    if (total === 0) {
      return res.status(200).json({
        overview: { total: 0, completed: 0, completionRate: 0, delayed: 0, delayRate: 0, pending: 0, avgResponseDays: 0, onTimeRate: 0 },
        statusDistribution: [],
        dailyCompletion: [],
        wasteCategories: [],
        locationPerformance: [],
        serviceTypeAnalysis: [],
      });
    }

    let completed = 0, delayed = 0, pending = 0, inProgress = 0, assigned = 0;
    let completedTotalDays = 0, completedWithDatesCount = 0;

    const dailyMap = {};
    const wasteMap = {};
    const locMap = {};
    const serviceMap = {};

    // Single pass iteration
    for (let i = 0; i < total; i++) {
      const r = allRequests[i];
      const { status, scheduled_date, createdAt, waste_category, location, service_type } = r;

      // 1. Overview KPIs
      if (status === "Completed") {
        completed++;
        if (createdAt && scheduled_date) {
          const created = new Date(createdAt);
          const scheduled = new Date(scheduled_date);
          completedTotalDays += Math.abs(scheduled - created) / (1000 * 60 * 60 * 24);
          completedWithDatesCount++;
        }
      } else if (status === "Delayed") {
        delayed++;
      } else if (status === "Pending") {
        pending++;
      } else if (status === "In Progress") {
        inProgress++;
      } else if (status === "Assigned") {
        assigned++;
      }

      // 2. Daily Completion Trend
      if (scheduled_date) {
        const date = new Date(scheduled_date).toISOString().split("T")[0];
        if (!dailyMap[date]) {
          dailyMap[date] = { date, completed: 0, total: 0, delayed: 0 };
        }
        dailyMap[date].total += 1;
        if (status === "Completed") dailyMap[date].completed += 1;
        if (status === "Delayed") dailyMap[date].delayed += 1;
      }

      // 3. Waste Category Breakdown
      if (waste_category) {
        wasteMap[waste_category] = (wasteMap[waste_category] || 0) + 1;
      }

      // 4. Location Performance
      if (location) {
        if (!locMap[location]) {
          locMap[location] = { location, total: 0, completed: 0, delayed: 0, pending: 0 };
        }
        locMap[location].total += 1;
        if (status === "Completed") locMap[location].completed += 1;
        if (status === "Delayed") locMap[location].delayed += 1;
        if (status === "Pending") locMap[location].pending += 1;
      }

      // 5. Service Type Analysis
      if (service_type) {
        if (!serviceMap[service_type]) {
          serviceMap[service_type] = { name: service_type, total: 0, completed: 0, delayed: 0 };
        }
        serviceMap[service_type].total += 1;
        if (status === "Completed") serviceMap[service_type].completed += 1;
        if (status === "Delayed") serviceMap[service_type].delayed += 1;
      }
    }

    const completionRate = Math.round((completed / total) * 100);
    const delayRate = Math.round((delayed / total) * 100);
    const onTimeRate = total - delayed > 0 ? Math.round((completed / (completed + delayed)) * 100) : 0;

    let avgResponseDays = 0;
    if (completedWithDatesCount > 0) {
      avgResponseDays = Math.round((completedTotalDays / completedWithDatesCount) * 10) / 10;
    }

    const statusDistribution = [
      { name: "Pending", value: pending, color: "#f59e0b" },
      { name: "Assigned", value: assigned, color: "#3b82f6" },
      { name: "In Progress", value: inProgress, color: "#8b5cf6" },
      { name: "Completed", value: completed, color: "#10b981" },
      { name: "Delayed", value: delayed, color: "#ef4444" },
    ].filter((s) => s.value > 0);

    const dailyCompletion = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        target: 2, // SLA target: 2 completions per day
        date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }));

    const wasteCategoryColors = {
      General: "#3b82f6",
      Recyclable: "#10b981",
      Hazardous: "#ef4444",
      Electronic: "#8b5cf6",
      Garden: "#f59e0b",
    };
    const wasteCategories = Object.entries(wasteMap).map(([name, value]) => ({
      name,
      value,
      color: wasteCategoryColors[name] || "#6b7280",
    }));

    const locationPerformance = Object.values(locMap)
      .map((loc) => ({
        ...loc,
        completionRate: loc.total > 0 ? Math.round((loc.completed / loc.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const serviceTypeColors = {
      Household: "#3b82f6",
      Commercial: "#10b981",
      Bulk: "#f59e0b",
      Garden: "#8b5cf6",
      "Drain Cleaning": "#ef4444",
    };
    const serviceTypeAnalysis = Object.values(serviceMap).map((s) => ({
      ...s,
      color: serviceTypeColors[s.name] || "#6b7280",
    }));

    // ── Final Response ────────────────────────────────
    res.status(200).json({
      overview: {
        total,
        completed,
        completionRate,
        delayed,
        delayRate,
        pending,
        inProgress,
        assigned,
        avgResponseDays,
        onTimeRate,
      },
      statusDistribution,
      dailyCompletion,
      wasteCategories,
      locationPerformance,
      serviceTypeAnalysis,
    });
  } catch (err) {
    console.error("SLA Analytics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getSLAAnalytics };
