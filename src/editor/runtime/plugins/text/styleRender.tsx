import type { FC } from "react";
import type { styleValue } from "../plugins";
import { RangeSlider } from "../../components/styleEditor/SingleSelector";
import { useCanvasI18n } from "../../../../i18n/context";
import type { MessageKey } from "../../../../i18n/en";

const FONT_OPTIONS: Array<{ key?: MessageKey; label?: string; family: string }> = [
    { key: 'font.system', family: 'Inter, ui-sans-serif, system-ui, sans-serif' },
    { key: 'font.yahei', family: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif' },
    { key: 'font.heiti', family: '"Hiragino Sans GB", "Heiti SC", STHeiti, SimHei, sans-serif' },
    { key: 'font.songti', family: '"Songti SC", STSong, SimSun, serif' },
    { key: 'font.kaiti', family: '"Kaiti SC", STKaiti, KaiTi, serif' },
    { label: 'Arial', family: 'Arial, sans-serif' },
    { label: 'Georgia', family: 'Georgia, serif' },
    { label: 'Times', family: '"Times New Roman", serif' },
    { key: 'font.mono', family: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
]

const FontFamilySelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = ({ value, onChange }) => {
    const t = useCanvasI18n()
    return <select className="font-family-select" value={typeof value === 'string' ? value : FONT_OPTIONS[0].family} onChange={(event) => onChange(event.target.value)}>
        {FONT_OPTIONS.map((option) => <option key={option.family} value={option.family} style={{ fontFamily: option.family }}>{option.key ? t(option.key) : option.label}</option>)}
    </select>
}

const FontSizeSelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = (props) => {
    const { value, onChange } = props

    return <RangeSlider value={typeof value === 'number' ? value : 14} onChange={onChange} max={96} min={10} />
}

const LetterSpacingSelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 0} min={-2} max={20} step={0.5} />
const LineHeightSelector: FC<{ value: styleValue, onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 1.5} min={0.8} max={3} step={0.1} />

export { FontFamilySelector, FontSizeSelector, LetterSpacingSelector, LineHeightSelector }
