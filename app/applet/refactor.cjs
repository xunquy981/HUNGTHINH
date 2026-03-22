const fs = require('fs');
const path = require('path');

function findFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, fileList);
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const filesToUpdate = findFiles('/components').concat(findFiles('/pages')).concat(findFiles('/hooks'));

const settingsProps = ['settings', 'setSettings', 'toggleTheme', 'isInitialized'];
const notificationProps = ['notifications', 'addNotifications', 'dismissNotification', 'clearAllNotifications', 'toasts', 'showNotification', 'removeToast', 'confirm'];
const domainProps = [
  'createOrder', 'updateOrderStatus', 'cancelOrder', 'deleteOrder', 'lockOrder',
  'createQuote', 'updateQuote', 'deleteQuote', 'convertQuoteToOrder',
  'addProduct', 'updateProduct', 'adjustStock',
  'addPartner', 'updatePartner', 'deletePartner',
  'createImportOrder', 'updateImportStatus', 'addReceivingNote',
  'addDeliveryNote', 'updateDeliveryNoteStatus', 'finalizeOrderWithDelivery',
  'addManualTransaction', 'deleteTransaction', 'addPaymentToDebt',
  'returnOrder', 'addPurchaseReturnNote'
];

for (const file of filesToUpdate) {
  if (!fs.existsSync(file)) {
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  
  // Find import { useAppContext } from '...';
  const importRegex = /import\s+\{\s*useAppContext\s*\}\s+from\s+['"]([^'"]+)['"];/g;
  let match = importRegex.exec(content);
  if (!match) {
    continue;
  }
  
  const importPath = match[1];
  const settingsImportPath = importPath.replace('AppContext', 'SettingsContext');
  const notificationImportPath = importPath.replace('AppContext', 'NotificationContext');
  const domainImportPath = importPath.replace('contexts/AppContext', 'hooks/useDomainServices');
  
  let hasSettings = false;
  let hasNotif = false;
  let hasDomain = false;
  let hasApp = false;

  // Find const { ... } = useAppContext();
  const destructureRegex = /const\s+\{\s*([^}]+)\s*\}\s*=\s*useAppContext\(\);/g;
  let destructureMatch;
  while ((destructureMatch = destructureRegex.exec(content)) !== null) {
    const props = destructureMatch[1].split(',').map(p => p.trim()).filter(p => p);
    
    const appProps = [];
    const setProps = [];
    const notifProps = [];
    const domProps = [];
    
    for (const prop of props) {
      if (settingsProps.includes(prop)) {
        setProps.push(prop);
        hasSettings = true;
      } else if (notificationProps.includes(prop)) {
        notifProps.push(prop);
        hasNotif = true;
      } else if (domainProps.includes(prop)) {
        domProps.push(prop);
        hasDomain = true;
      } else {
        appProps.push(prop);
        hasApp = true;
      }
    }
    
    let newDestructures = [];
    if (appProps.length > 0) newDestructures.push(`const { ${appProps.join(', ')} } = useAppContext();`);
    if (setProps.length > 0) newDestructures.push(`const { ${setProps.join(', ')} } = useSettings();`);
    if (notifProps.length > 0) newDestructures.push(`const { ${notifProps.join(', ')} } = useNotification();`);
    if (domProps.length > 0) newDestructures.push(`const { ${domProps.join(', ')} } = useDomainServices();`);
    
    content = content.replace(destructureMatch[0], newDestructures.join('\n    '));
    
    // Reset regex index because we modified the string
    destructureRegex.lastIndex = 0;
  }
  
  let newImports = [];
  if (hasApp) newImports.push(`import { useAppContext } from '${importPath}';`);
  if (hasSettings) newImports.push(`import { useSettings } from '${settingsImportPath}';`);
  if (hasNotif) newImports.push(`import { useNotification } from '${notificationImportPath}';`);
  if (hasDomain) newImports.push(`import { useDomainServices } from '${domainImportPath}';`);
  
  content = content.replace(match[0], newImports.join('\n'));
  
  fs.writeFileSync(file, content);
  console.log('Updated', file);
}
console.log('Done refactoring contexts');
