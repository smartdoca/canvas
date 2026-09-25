import type { styleControlRender } from "../../plugins/plugins";
import { FillColorSelector, FontColorSelector, StrokeColorSelector } from "./ColorSelector";
import { ArrowHeadSelector, CornerRadiusSelector, FontWeightSelector, ItalicSelector, OpacitySelector, RoughFillStyleSelector, RoughModeSelector, RoughStrokeStyleSelector, SidesSelector, StrokeStyleSelector, StrokeWidthSelector, TextAlignSelector, TextDecorationSelector } from "./SingleSelector";

const commonStyleRenders: styleControlRender[] = [
    {
        key: 'roughMode',
        title: 'style.roughMode',
        order: 0,
        render: RoughModeSelector,
    },
    { key: 'roughFillStyle', title: 'style.roughFill', order: 0.1, render: RoughFillStyleSelector },
    { key: 'roughStrokeStyle', title: 'style.roughStroke', order: 0.2, render: RoughStrokeStyleSelector },
    {
        key: 'stroke',
        title: 'style.stroke',
        order: 1,
        render: StrokeColorSelector,
    },
    {
        key: 'fill',
        title: 'style.fill',
        order: 2,
        render: FillColorSelector,
    },
    {
        key: 'strokeWidth',
        title: 'style.strokeWidth',
        order: 3,
        render: StrokeWidthSelector,
    },
    {
        key: 'dashPattern',
        title: 'style.dash',
        order: 4,
        render: StrokeStyleSelector,
    },
    {
        key: 'fontColor',
        title: 'style.text',
        order: 5,
        render: FontColorSelector,
    },
    { key: 'endArrow', title: 'style.arrow', order: 5, render: ArrowHeadSelector },
    {
        key: 'cornerRadius',
        title: 'style.corner',
        order: 6,
        render: CornerRadiusSelector,
    },
    {
        key: 'sides',
        title: 'style.sides',
        order: 7,
        render: SidesSelector,
    },
    {
        key: 'corners',
        title: 'style.corners',
        order: 7,
        render: SidesSelector,
    },
    {
        key: 'fontWeight',
        title: 'style.fontWeight',
        order: 8,
        render: FontWeightSelector,
    },
    { key: 'italic', title: 'style.italic', order: 8.1, render: ItalicSelector },
    { key: 'textDecoration', title: 'style.decoration', order: 8.2, render: TextDecorationSelector },
    { key: 'textAlign', title: 'style.align', order: 8.3, render: TextAlignSelector },
    {
        key: 'opacity',
        title: 'style.opacity',
        order: 100,
        render: OpacitySelector,
    }
]

export { commonStyleRenders }
