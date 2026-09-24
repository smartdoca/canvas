import type { styleControlRender } from "../../plugins/plugins";
import { FillColorSelector, FontColorSelector, StrokeColorSelector } from "./ColorSelector";
import { ArrowHeadSelector, CornerRadiusSelector, FontWeightSelector, ItalicSelector, OpacitySelector, RoughFillStyleSelector, RoughModeSelector, RoughStrokeStyleSelector, SidesSelector, StrokeStyleSelector, StrokeWidthSelector, TextAlignSelector, TextDecorationSelector } from "./SingleSelector";

const commonStyleRenders: styleControlRender[] = [
    {
        key: 'roughMode',
        title: '绘制风格',
        order: 0,
        render: RoughModeSelector,
    },
    { key: 'roughFillStyle', title: '手绘填充', order: 0.1, render: RoughFillStyleSelector },
    { key: 'roughStrokeStyle', title: '手绘线条', order: 0.2, render: RoughStrokeStyleSelector },
    {
        key: 'stroke',
        title: '描边',
        order: 1,
        render: StrokeColorSelector,
    },
    {
        key: 'fill',
        title: '填充',
        order: 2,
        render: FillColorSelector,
    },
    {
        key: 'strokeWidth',
        title: '线宽',
        order: 3,
        render: StrokeWidthSelector,
    },
    {
        key: 'dashPattern',
        title: '线条样式',
        order: 4,
        render: StrokeStyleSelector,
    },
    {
        key: 'fontColor',
        title: '文字',
        order: 5,
        render: FontColorSelector,
    },
    { key: 'endArrow', title: '箭头样式', order: 5, render: ArrowHeadSelector },
    {
        key: 'cornerRadius',
        title: '圆角',
        order: 6,
        render: CornerRadiusSelector,
    },
    {
        key: 'sides',
        title: '边数',
        order: 7,
        render: SidesSelector,
    },
    {
        key: 'corners',
        title: '角数',
        order: 7,
        render: SidesSelector,
    },
    {
        key: 'fontWeight',
        title: '字重',
        order: 8,
        render: FontWeightSelector,
    },
    { key: 'italic', title: '斜体', order: 8.1, render: ItalicSelector },
    { key: 'textDecoration', title: '文字装饰', order: 8.2, render: TextDecorationSelector },
    { key: 'textAlign', title: '文字对齐', order: 8.3, render: TextAlignSelector },
    {
        key: 'opacity',
        title: '不透明度',
        order: 100,
        render: OpacitySelector,
    }
]

export { commonStyleRenders }
