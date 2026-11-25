import { IoCheckmarkSharp } from "react-icons/io5";


export default function BlockedDeviceCard({ props, reason, handleAddToDevices, handleUnblock, onAllow30, allowLoading, allowError })
{
    const canAllow = Boolean(props.prismaDeviceId);
    const kind = reason?.kind || 'unknown';
    const badgeClass = kind === 'manual' ? 'badge-error'
        : kind === 'schedule' ? 'badge-info'
        : kind === 'paused' ? 'badge-warning'
        : 'badge-ghost';
    const reasonTitle = reason?.detail
        ? `${reason.detail}${reason?.timestamp ? ` — ${reason.timestamp}` : ''}`
        : '';
    return (
        <>
            <div className="card w-72 sm:w-96 bg-base-100 shadow-xl hover:bg-base-300">
                <div className="card-body">
                    <h2 className="card-title"><span className="italic font-thin">oui: </span>{props?.oui ? props?.oui : '"none"'}</h2>
                    <div className={`badge badge-lg ${badgeClass}`} title={reasonTitle || undefined}>{reason?.label ?? 'Unknown'}</div>
                    <p><span className="italic font-thin">hostname: </span>{props?.hostname}</p>
                    <p><span className="italic font-thin">mac: </span>{props?.mac}</p>
                    <p><span className="italic font-thin">last ip: </span>{props?.last_ip}</p>
                    <p><span className="italic font-thin">is guest: </span>{props?.is_guest === true ? 'true' : 'false'}</p>
                    <p><span className="italic font-thin">is wired: </span>{props?.is_wired === true ? 'true' : 'false'}</p>
                    <p><span className="italic font-thin">_id: </span>{props?._id}</p>
                    <div className="card-actions justify-between pt-4">
                        <button
                            className={`btn btn-sm btn-outline btn-success ${!canAllow ? 'btn-disabled' : ''}`}
                            title={!canAllow ? 'Add to devices first' : undefined}
                            disabled={!canAllow || allowLoading}
                            onClick={() => onAllow30 && onAllow30(props)}
                        >
                            {allowLoading
                                ? <span className="loading loading-spinner loading-sm" />
                                : 'Allow 30 minutes'}
                        </button>
                        <button
                            className="btn"
                            onClick={() => handleUnblock(props)}
                            >Unblock
                        </button>
                        <button
                            className={`btn ${props.onList ? 'btn-disabled' : ''}`}
                            data-macaddress={props.mac}
                            onClick={() => handleAddToDevices(props)}>
                                {props.onList ?
                                (
                                    <> On Device List <IoCheckmarkSharp /> </>
                                ) : ('Add to Devices')
                                }
                        </button>
                        {allowError ? <p className="text-error text-sm">{allowError}</p> : null}
                    </div>
                </div>
            </div>
        </>
    );
}