import type { App, IUI } from "leafer-ui";
import type { FC } from "react";
import type { CustomShapeDefinition } from '../../../sdk/types';

interface AddMenuProps {
    app: App;
    activeKey: string;
    onClick: (activeKey: string) => void;
    onCreateComplete: () => void;
    customShapes?: CustomShapeDefinition[];
}

interface RegisterEventFuncParam {
    app: App;
    canEdit?: () => boolean;
}

type styleValue = string | number | boolean | number[] | undefined

interface styleControlRender {
    key: string;
    title: string;
    order: number;
    render: FC<{ value: styleValue, onChange: (value: styleValue) => void }>;
}

export interface Plugins {
    name: string;
    shortcut?: string;
    AddMenu: React.FC<AddMenuProps>;
    styleControlKeys: string[];
    customStyleControlRenders: styleControlRender[];
    RegisterEvent?: (param: RegisterEventFuncParam) => void;
    setStyleCustom: { [key: string]: (i: IUI, value:styleValue) => void };
    getStyleCustom: { [key: string]: (i: IUI) => styleValue };
}

export type { AddMenuProps, RegisterEventFuncParam, styleControlRender, styleValue }
