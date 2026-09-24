(function(root) {
  'use strict';
  const RELEASE = '20260924-session-1';
  const LAYERS = [
    ['cfd-simulation-btn', 'Wind · CFD', 'Environment', '🌬', 'obstacle'],
    ['stormwater-btn', 'Stormwater', 'Environment', '💧'],
    ['sun-study-btn', 'Sun study', 'Environment', '☀'],
    ['thermal-comfort-btn', 'Comfort · CoolPaths', 'Environment', '🌡', 'route'],
    ['isovist-btn', 'Isovist', 'Explore', '◉', 'viewer'],
    ['street-view-btn', 'Street View', 'Explore', '📍', 'select'],
    ['epc-btn', 'Building energy · EPC', 'Energy', '▥', 'select'],
    ['ecom-energy-btn', 'Energy community', 'Energy', '⚡', 'select'],
    ['bird-sounds-btn', 'Bird sounds', 'Explore', '♫'],
    ['slideshow-btn', 'Slideshow', 'Present', '▧'],
    ['campus-demo-btn', 'Campus vision', 'Present', '⌂'],
    ['fcc-demo-btn', 'FCC walkthrough', 'Present', '▷'],
    ['grid-animation-btn', 'Table grid', 'Present', '▦'],
    ['canvas-btn', 'Canvas', 'Create', '✎', 'pen']
  ].map(([id, name, group, icon, tool]) => ({id, name, group, icon, tool}));
  const ACTIONS = {
    cfd_control: 'get_state set_wind_speed set_wind_direction set_viscosity set_resolution toggle_trees set_particles set_visual_style set_facade_glow set_color_palette set_color_range set_particle_speed',
    thermal_control: 'request_state clear_route set_mode tour_play tour_pause tour_step tour_next tour_back tour_end tour_explore tour_layer set_hour show_raster show_streets',
    isovist_control: 'request_state set_radius set_fov toggle_360 toggle_follow toggle_trees toggle_ambient_sound set_ambient_volume',
    sun_control: 'request_state set_date set_time set_opacity toggle_animation set_speed toggle_false_color toggle_trees get_memory',
    bird_control: 'set_volume stop_all request_status',
    slideshow_control: 'next previous stop request_status',
    campus_demo_control: 'autoplay next previous stop',
    fcc_demo_control: 'play pause seek set_speed set_video_duration toggle'
  };
  const ECOM = new Set('ecom_ui_state ecom_ping ecom_request_summary ecom_hour ecom_release ecom_layer ecom_filters ecom_caption ecom_uniform ecom_flows ecom_sound ecom_sound_request ecom_change ecom_change_result ecom_audio_request ecom_vehicles_request'.split(' '));
  const AVATARS = ['🦊','🐙','🦉','🐸','🐢','🐧','🦋','🦄'];
  const COLORS = ['#38bdf8','#fb923c','#c084fc','#4ade80','#fb7185','#facc15'];
  function id() { return crypto.randomUUID().replaceAll('-', ''); }
  function validControl(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    if (JSON.stringify(message).length > 4 * 1024 * 1024) return false;
    if (ECOM.has(message.type)) return true;
    if (!ACTIONS[message.type]?.split(' ').includes(message.action)) return false;
    const v = message.value;
    if (v !== undefined && !['number','string','boolean'].includes(typeof v)) return false;
    if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 100000)) return false;
    if (typeof v === 'string' && v.length > 100) return false;
    const ranges={isovist_control:{set_radius:[50,500],set_fov:[30,180],set_ambient_volume:[0,1]},sun_control:{set_time:[0,24],set_opacity:[0,1],set_speed:[.5,5]},bird_control:{set_volume:[0,1]},fcc_demo_control:{seek:[0,1],set_speed:[.25,2],set_video_duration:[1,86400]}};
    const range=ranges[message.type]?.[message.action];
    if(range&&(!Number.isFinite(Number(v))||Number(v)<range[0]||Number(v)>range[1]))return false;
    if (message.action === 'set_date' && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)))) return false;
    return true;
  }
  function point(value) { return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 85.1; }
  function validObject(object) {
    return object && ['pen','line','arrow','polygon','marker','comment','obstacle'].includes(object.tool) &&
      Array.isArray(object.points) && object.points.length > 0 && object.points.length <= 2000 && object.points.every(point) &&
      (!['polygon','obstacle'].includes(object.tool) || object.points.length >= 3) &&
      (object.text === undefined || typeof object.text === 'string' && object.text.length <= 500) &&
      /^#[0-9a-f]{6}$/i.test(object.color || '') && Number.isFinite(object.width) && object.width >= 1 && object.width <= 12;
  }
  function editObject(objects, actor, action) {
    const index = objects.findIndex(o => o.id === action.objectId);
    const old = objects[index];
    if (old && actor.id !== 'host' && old.creatorId !== actor.id) throw Error('Only the author or host can edit this annotation');
    if (action.operation === 'delete') {
      if (!old) throw Error('Annotation no longer exists');
      objects.splice(index, 1); return {before: old, after: null};
    }
    if (!validObject(action.object)) throw Error('Invalid annotation');
    if (action.operation === 'update' && !old) throw Error('Annotation no longer exists');
    const next = {...action.object, id: old?.id || action.objectId || id(),
      creatorId: old?.creatorId || actor.id, creatorName: old?.creatorName || actor.name};
    if (index < 0) objects.push(next); else objects[index] = next;
    return {before: old || null, after: next};
  }
  // Large results use bounded chunks; ordinary messages remain small and ordered.
  function wire(connection, receive, failure = () => {}) {
    const pending = new Map();
    connection.on('data', value => {
      if (!value || typeof value !== 'object') return;
      if (value.type !== 'chunk') { receive(value); return; }
      if (typeof value.id !== 'string' || typeof value.data !== 'string' || value.data.length > 12000 ||
          !Number.isInteger(value.index) || !Number.isInteger(value.total) || value.total < 1 || value.total > 3000 || value.index < 0 || value.index >= value.total) return;
      if (!pending.has(value.id)) {
        if (pending.size >= 4) return;
        const entry = {parts: new Array(value.total), count: 0, size: 0};
        entry.timer = setTimeout(() => pending.delete(value.id), 30000); pending.set(value.id, entry);
      }
      const entry = pending.get(value.id);
      if (entry.parts.length !== value.total || entry.parts[value.index] !== undefined) return;
      entry.parts[value.index] = value.data; entry.count++; entry.size += value.data.length;
      if (entry.size > 24 * 1024 * 1024) { pending.delete(value.id); clearTimeout(entry.timer); return; }
      if (entry.count === value.total) {
        clearTimeout(entry.timer); pending.delete(value.id);
        try { receive(JSON.parse(entry.parts.join(''))); } catch (error) { failure(error); }
      }
    });
    connection.on('close', () => { for (const entry of pending.values()) clearTimeout(entry.timer); pending.clear(); });
    let queue = Promise.resolve();
    return value => {
      queue = queue.then(async () => {
        if (!connection.open) return;
        const json = JSON.stringify(value);
        if (json.length < 12000) { connection.send(value); return; }
        const messageId = id(), total = Math.ceil(json.length / 12000);
        for (let index = 0; index < total; index++) {
          while (connection.open && (connection.dataChannel?.bufferedAmount || 0) > 256000) await new Promise(resolve => setTimeout(resolve, 20));
          if (!connection.open) return;
          connection.send({type: 'chunk', id: messageId, index, total, data: json.slice(index * 12000, (index + 1) * 12000)});
        }
      }).catch(failure);
    };
  }
  const MR = {RELEASE, LAYERS, ACTIONS, ECOM, AVATARS, COLORS, id, validControl, point, validObject, editObject, wire};
  root.MR = MR;
  if (typeof module !== 'undefined') module.exports = MR;
})(typeof window === 'undefined' ? globalThis : window);
