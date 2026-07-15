import React from "react";

const RefreshButton = ({ onRefresh, loading = false }) => {
  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        background: "#2563eb",
        color: "#fff",
        border: "none",
        borderRadius: "10px",
        padding: "12px 22px",
        fontSize: "15px",
        fontWeight: "600",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: "0 6px 15px rgba(0,0,0,0.2)",
        zIndex: 9999,
      }}
    >
      {loading ? "Refreshing..." : "🔄 Refresh"}
    </button>
  );
};

export default RefreshButton;