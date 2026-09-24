import type { FC } from "react";
import type { styleValue } from "../plugins";
import { RangeSlider } from "../../components/styleEditor/SingleSelector";

const FONT_OPTIONS = [
    ['系统默认', 'Inter, ui-sans-serif, system-ui, sans-serif'],
    ['雅黑 / 苹方', '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif'],
    ['黑体', '"Hiragino Sans GB", "Heiti SC", STHeiti, SimHei, sans-serif'],
    ['宋体', '"Songti SC", STSong, SimSun, serif'],
    ['楷体', '"Kaiti SC", STKaiti, KaiTi, serif'],
    ['Arial', 'Arial, sans-serif'],
    ['Georgia', 'Georgia, serif'],
    ['Times', '"Times New Roman", serif'],
    ['等宽', 'ui-monospace, SFMono-Regular, Menlo, monospace'],
]

const FontFamilySelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = ({ value, onChange }) => <select className="font-family-select" value={typeof value === 'string' ? value : FONT_OPTIONS[0][1]} onChange={(event) => onChange(event.target.value)}>
    {FONT_OPTIONS.map(([label, family]) => <option key={family} value={family} style={{ fontFamily: family }}>{label}</option>)}
</select>

const FontSizeSelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = (props) => {
    const { value, onChange } = props

    return <RangeSlider value={typeof value === 'number' ? value : 14} onChange={onChange} max={96} min={10} />
}

const LetterSpacingSelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 0} min={-2} max={20} step={0.5} />
const LineHeightSelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 1.5} min={0.8} max={3} step={0.1} />

export { FontFamilySelector, FontSizeSelector, LetterSpacingSelector, LineHeightSelector }
