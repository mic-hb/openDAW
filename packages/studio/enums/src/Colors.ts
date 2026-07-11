import {Color} from "@opendaw/lib-std"

export const LogicTrackColors = [
    new Color(211, 100, 50), // 0: Blue
    new Color(135, 60, 49),  // 1: Green
    new Color(48, 100, 50),  // 2: Yellow
    new Color(35, 100, 50),  // 3: Orange
    new Color(2, 100, 59),   // 4: Red
    new Color(280, 70, 60),  // 5: Purple
    new Color(320, 70, 60),  // 6: Pink
    new Color(180, 70, 40),  // 7: Teal
    new Color(90, 70, 40),   // 8: Olive
    new Color(25, 70, 40),   // 9: Brown
    new Color(230, 70, 60),  // 10: Indigo
    new Color(350, 70, 60),  // 11: Crimson
    new Color(160, 70, 50),  // 12: Mint
    new Color(200, 70, 50),  // 13: Cyan
    new Color(60, 70, 50),   // 14: Gold
    new Color(260, 70, 60),  // 15: Violet
]

export const Colors = {
    white: new Color(0, 0, 100),
    blue: new Color(211, 100, 50),
    green: new Color(135, 60, 49),
    yellow: new Color(48, 100, 50),
    cream: new Color(65, 20, 83),
    orange: new Color(35, 100, 50),
    red: new Color(2, 100, 59),
    purple: new Color(280, 70, 60),
    bright: new Color(0, 0, 95),
    gray: new Color(0, 0, 88),
    dark: new Color(0, 0, 70),
    shadow: new Color(0, 0, 55),
    black: new Color(0, 0, 20),
    background: new Color(0, 0, 7),
    panelBackground: new Color(0, 0, 9),
    panelBackgroundBright: new Color(0, 0, 15),
    panelBackgroundDark: new Color(0, 0, 7)
}

export const initializeColors = (root: { style: { setProperty: (name: string, value: string) => void } }) => {
    Object.entries(Colors).forEach(([name, value]) => {
        const cssName = name.replace(/([A-Z])/g, "-$1").toLowerCase()
        root.style.setProperty(`--color-${cssName}`, value.toString())
    })
}