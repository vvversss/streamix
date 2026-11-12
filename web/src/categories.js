export const categories = [
  { id: 'chat', name: 'Общение', color: '#a87bff', icon: 'MessageCircle' },
  { id: 'cs2', name: 'Counter-Strike 2', color: '#ffac64', icon: 'Crosshair' },
  { id: 'fortnite', name: 'Fortnite', color: '#79bcff', icon: 'Zap' },
  { id: 'minecraft', name: 'Minecraft', color: '#7bddaf', icon: 'Box' },
  { id: 'roblox', name: 'Roblox', color: '#f77cb0', icon: 'Gamepad2' },
  { id: 'music', name: 'Музыка', color: '#f394ed', icon: 'Music2' },
  { id: 'irl', name: 'IRL', color: '#ffc479', icon: 'MapPin' },
  { id: 'other', name: 'Другое', color: '#aeb4ed', icon: 'Shapes' }
];
export const categoryName = id => categories.find(category => category.id === id)?.name ?? id;
