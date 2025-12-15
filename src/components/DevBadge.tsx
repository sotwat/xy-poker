import React from 'react';

export const DevBadge: React.FC = () => (
    <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        marginLeft: '4px',
        backgroundColor: '#1DA1F2', // Verified Blue
        color: 'white',
        borderRadius: '50%',
        width: '14px',
        height: '14px',
        fontSize: '9px',
        fontWeight: 'bold',
        // Prevent simple imitation via text
        border: '1px solid white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        userSelect: 'none',
        cursor: 'help'
    }} title="Verified Developer">
        ✓
    </span>
);
