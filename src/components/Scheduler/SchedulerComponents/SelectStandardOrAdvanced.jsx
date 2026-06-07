export function SelectStandardOrAdvanced({ scheduleMode, setScheduleMode, reRender }) {
    const handleSelectMode = (mode) => {
        if (scheduleMode === mode) return;
        setScheduleMode(mode);
        reRender();
    };

    return (
        <>
            <div className="flex items-center justify-center">
                <div className="join m-4 bg-base-200 border-8 border-base-200 rounded-lg">
                    <input
                        onChange={() => handleSelectMode("standard")}
                        className="join-item btn"
                        value="standard"
                        type="radio"
                        name="optionsStandardAdvanced"
                        aria-label="Standard"
                        checked={scheduleMode === "standard"}
                    />
                    <input
                        onChange={() => handleSelectMode("advanced")}
                        className="join-item btn"
                        value="advanced"
                        type="radio"
                        name="optionsStandardAdvanced"
                        aria-label="Advanced"
                        checked={scheduleMode === "advanced"}
                    />
                </div>
            </div>

        </>
    );
}