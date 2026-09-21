// Energy Performance Certificate dashboard.
let epcState = { selected: null };

const EPC_CLASS_COLORS = {
    A: '#16803c',
    B: '#4f9f3e',
    C: '#91b93e',
    D: '#d1c83b',
    E: '#e7a832',
    F: '#dd702d',
    G: '#bd3c2f'
};

const EPC_FIELD_GROUPS = [
    {
        title: 'Certificate',
        fields: [
            ['Certificate ID', 'FormularId'],
            ['Class', 'EgiEnergiklass'],
            ['Certificate period', 'EgiForstaArManad', 'EgiSistaArManad'],
            ['Calculated value', 'EgiBeraknatVarde']
        ]
    },
    {
        title: 'Building',
        fields: [
            ['Category', 'EgenByggnadsKat'],
            ['Building type', 'EgenByggnadsTyp'],
            ['Construction year', 'EgenNybyggAr'],
            ['Heated area (A-temp)', 'EgenAtemp'],
            ['Total heated area', 'EgenAtempSumma'],
            ['Living area (BOA)', 'EgenBOA'],
            ['Usable area (BRA)', 'EgenBRA'],
            ['Commercial area (LOA)', 'EgenLOA'],
            ['Gross floor area (BTA)', 'EgenBTA'],
            ['Floors', 'EgenAntalPlan'],
            ['Basement floors', 'EgenAntalKallarplan'],
            ['Stairwells', 'EgenAntalTrapphus'],
            ['Apartments', 'EgenAntalBolgh'],
            ['Protected or valuable building', 'EgenSkyddadEllerVardefull']
        ]
    },
    {
        title: 'Energy',
        fields: [
            ['Energy performance', 'EgiEnergiPrestanda'],
            ['Specific energy use', 'EgiSpecifikEnergianvandning'],
            ['Total energy use', 'EgiEnergianvandning'],
            ['Primary energy use', 'EgiPrimarenergianvandning'],
            ['Primary energy rating', 'EgiPrimarenergital2020'],
            ['Share electricity', 'EgiVaravEl'],
            ['Total measured energy', 'EgiSumma1'],
            ['Total delivered energy', 'EgiSumma2'],
            ['Total energy incl. supplements', 'EgiSumma3'],
            ['Property energy', 'EgiFastighet'],
            ['Activity energy', 'EgiVerksamhet'],
            ['District heating', 'EgiFjarrvarme'],
            ['Domestic hot water', 'EgiVVBered'],
            ['District cooling', 'EgiFjarrkyla'],
            ['Electricity', 'EgiElDirekt'],
            ['Waterborne electricity', 'EgiElVatten'],
            ['Ground-source heat pump', 'EgiPumpMark'],
            ['Air-source heat pump', 'EgiPumpLuftLuft'],
            ['Solar cells', 'EgiSolcell'],
            ['Solar heating', 'EgiSolvarme'],
            ['Produced electricity', 'EgiBerElProduktion'],
            ['Normalised energy', 'EgiNormKorrEI'],
            ['Reference value', 'EgiRefvarde1'],
            ['Reference range', 'EgiRefvarde2Min', 'EgiRefvarde2Max']
        ]
    },
    {
        title: 'Ventilation',
        fields: [
            ['FTX', 'VentTypFTX'],
            ['F', 'VentTypF'],
            ['FT', 'VentTypFT'],
            ['Natural ventilation', 'VentTypSjalvdrag'],
            ['Mechanical exhaust', 'VentTypFmed'],
            ['Ventilation requirement', 'VentGruppKrav'],
            ['Ventilation approved', 'VentGruppGodkand'],
            ['Ventilation remarks', 'VentGruppUtanAnm'],
            ['Ventilation flow', 'EgenProjVentFlode']
        ]
    },
    {
        title: 'Inspections & measures',
        fields: [
            ['Heating inspection required', 'InspUppvGruppInspSkyldighet'],
            ['Heating inspection agreement', 'InspUppvUndAvtalEgipres'],
            ['Air inspection required', 'InspLuftGruppInspSkyldighet'],
            ['Air inspection agreement', 'InspLuftUndAvtalEgipres'],
            ['Estimated savings', 'AtgForslagEgiMinskad'],
            ['Estimated measure cost', 'AtgForslagKostnad'],
            ['Estimated CO2 reduction', 'AtgForslagCO2'],
            ['Completed measures year', 'AtgUtfordaUtfortAr'],
            ['Radon measured', 'RadGruppHaltMatt'],
            ['Radon level', 'RadHalt'],
            ['Radon method', 'RadTypMatning'],
            ['Radon measurement date', 'RadMatDatum'],
            ['Certificate approved', 'Godkand'],
            ['Certificate version', 'Version'],
            ['Inspector qualification', 'ExpertBehorighet']
        ]
    }
];

function escapeEpcValue(value) {
    return String(value ?? 'Not available')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderEpcBuildingDashboard(building) {
    const dashboardContent = document.getElementById('dashboard-content');
    if (!dashboardContent) return;
    if (!building) {
        dashboardContent.innerHTML = '<div class="epc-empty">Click a building on the map to inspect its EPC.</div>';
        return;
    }
    const properties = building.properties || {};
    if (properties.FormularId == null) {
        dashboardContent.innerHTML = '<div class="epc-empty"><strong>No EPC data available</strong><br>This building is not linked to an energy performance certificate.</div>';
        return;
    }
    let detail = properties.epc_detail || {};
    if (typeof detail === 'string') {
        try {
            detail = JSON.parse(detail);
        } catch (error) {
            detail = {};
        }
    }
    const getValue = key => detail[key] ?? properties[key];
    const hasValue = value => value !== null && value !== undefined && value !== '';
    const classValue = properties.energy_class || detail.EgiEnergiklass;
    const className = escapeEpcValue(classValue || 'No class');
    const classColor = EPC_CLASS_COLORS[classValue] || '#6b7280';
    const address = getValue('IdAdr') || properties.byggnadsnamn1;
    const location = [getValue('IdPostnr'), getValue('IdPostort')].filter(hasValue).join(' ');
    const identityRows = [
        ['Address', address],
        ['Location', location],
        ['Property', properties.fastighetsbeteckning],
        ['Building category', properties.building_category],
        ['Construction year', properties.construction_year],
        ['EPC ID', properties.FormularId]
    ].filter(([, data]) => hasValue(data));
    const detailGroups = EPC_FIELD_GROUPS.map(group => {
        const rows = group.fields.map(([label, firstKey, secondKey]) => {
            const firstValue = firstKey === 'FormularId' ? properties.FormularId : getValue(firstKey);
            const secondValue = secondKey ? getValue(secondKey) : null;
            if (!hasValue(firstValue) && !hasValue(secondValue)) return '';
            const displayValue = secondKey && hasValue(secondValue) ? `${firstValue || ''} - ${secondValue}` : firstValue;
            return `<div class="epc-detail-row"><dt>${label}</dt><dd>${escapeEpcValue(displayValue)}</dd></div>`;
        }).join('');
        return rows ? `<section class="epc-field-group"><h3>${group.title}</h3><dl>${rows}</dl></section>` : '';
    }).join('');
    dashboardContent.innerHTML = `
        <div class="epc-summary" style="--epc-class-color:${classColor}">
            <div class="epc-class-badge">${className}</div>
            <div><div class="epc-summary-label">Energy class</div><strong>${className}</strong></div>
            <div><div class="epc-summary-label">Specific energy</div><strong>${escapeEpcValue(getValue('EgiSpecifikEnergianvandning') || 'No value')} kWh/m2</strong></div>
            <div><div class="epc-summary-label">Energy performance</div><strong>${escapeEpcValue(getValue('EgiEnergiPrestanda') || 'No value')} kWh/m2</strong></div>
        </div>
        <dl class="epc-detail-list">${identityRows.map(([label, data]) => `<div class="epc-detail-row"><dt>${label}</dt><dd>${escapeEpcValue(data)}</dd></div>`).join('')}</dl>
        <div class="epc-detail-caption">Certificate details</div>
        <div class="epc-field-groups">${detailGroups}</div>
    `;
}


function showEpcDashboard(dashboardTitle, legendTitle, legendContent) {
    if (dashboardTitle) dashboardTitle.textContent = 'Energy Performance Certificate';
    if (legendTitle) legendTitle.textContent = 'EPC Class';
    legendContent.style.display = 'block';
    const campusLegend = document.getElementById('campus-demo-legend');
    if (campusLegend) campusLegend.style.display = 'none';
    const classes = [['A', '#16803c'], ['B', '#4f9f3e'], ['C', '#91b93e'], ['D', '#d1c83b'], ['E', '#e7a832'], ['F', '#dd702d'], ['G', '#bd3c2f']];
    legendContent.innerHTML = `<div class="epc-legend">${classes.map(([label, color]) => `<div class="epc-legend-item"><span style="background:${color}"></span><strong>${label}</strong></div>`).join('')}<div class="epc-legend-item"><span style="background:#6b7280"></span><strong>No data</strong></div></div>`;
    renderEpcBuildingDashboard(epcState.selected);
    return;
}
