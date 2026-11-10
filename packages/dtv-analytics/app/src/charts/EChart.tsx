import { useEffect, useRef } from 'react';
import { BarChart, BoxplotChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

// Only the charts the app draws, to keep its bundle small
echarts.use([BarChart, BoxplotChart, LineChart, AriaComponent, GridComponent, TooltipComponent, CanvasRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

/** An ECharts chart that follows its option and the width of its container. */
export function EChart({ option, height, label }: { option: ChartOption; height: number; label: string }) {
    const element = useRef<HTMLDivElement>(null);
    const chart = useRef<echarts.ECharts | null>(null);

    useEffect(() => {
        if (element.current === null) return;
        const instance = echarts.init(element.current, undefined, { renderer: 'canvas' });
        chart.current = instance;
        const observer = new ResizeObserver(() => instance.resize());
        observer.observe(element.current);
        return () => {
            observer.disconnect();
            instance.dispose();
            chart.current = null;
        };
    }, []);

    useEffect(() => {
        chart.current?.setOption({ aria: { enabled: true, label: { description: label } }, ...option }, true);
    }, [option, label]);

    return <div ref={element} role="img" aria-label={label} style={{ width: '100%', height }} />;
}
