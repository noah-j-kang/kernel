import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

export default function Chart({ instrumentId, currentMid }) {
  const chartContainerRef = useRef();
  const [chart, setChart] = useState(null);
  const [series, setSeries] = useState(null);
  
  // Ref to hold the current candle we are building
  const currentCandleRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const newChart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.9)',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const newSeries = newChart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#10b981',
      wickDownColor: '#ef4444',
      wickUpColor: '#10b981',
    });

    setChart(newChart);
    setSeries(newSeries);

    const handleResize = () => {
      newChart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      newChart.remove();
    };
  }, []);

  // When instrumentId changes, reset the chart
  useEffect(() => {
    if (series) {
      series.setData([]);
      currentCandleRef.current = null;
    }
  }, [instrumentId, series]);

  // Handle incoming midpoint ticks
  useEffect(() => {
    if (!series || !currentMid || currentMid === 0) return;

    // We build 1-second candles
    const now = Math.floor(Date.now() / 1000); // 1-second resolution

    if (!currentCandleRef.current) {
      currentCandleRef.current = {
        time: now,
        open: currentMid,
        high: currentMid,
        low: currentMid,
        close: currentMid,
      };
      series.update(currentCandleRef.current);
    } else {
      const candle = currentCandleRef.current;
      
      // If we are in a new second, commit the old one and start a new one
      if (now > candle.time) {
        const newCandle = {
          time: now,
          open: currentMid,
          high: currentMid,
          low: currentMid,
          close: currentMid,
        };
        currentCandleRef.current = newCandle;
        series.update(newCandle);
      } else {
        // Update current candle
        candle.high = Math.max(candle.high, currentMid);
        candle.low = Math.min(candle.low, currentMid);
        candle.close = currentMid;
        series.update(candle);
      }
    }
  }, [currentMid, series]);

  return <div ref={chartContainerRef} style={{ width: '100%', height: '300px' }} />;
}
