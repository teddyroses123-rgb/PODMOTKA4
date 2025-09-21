import { SiteContent } from '../types/content';
import { defaultContent } from '../data/defaultContent';
import { saveContentToDatabase, loadContentFromDatabase } from './supabase';

// Debounce функция для отложенного сохранения
let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DELAY = 1000; // 1 секунда задержки

const STORAGE_KEY = 'siteContent';

export const saveContent = async (content: SiteContent, immediate: boolean = false): Promise<void> => {
  try {
    console.log('💾 НАЧИНАЕМ СОХРАНЕНИЕ...');
    
    if (immediate) {
      // Немедленное сохранение
      console.log('🚀 НЕМЕДЛЕННОЕ сохранение в БД...');
      const dbSaved = await saveContentToDatabase(content);
      
      if (dbSaved) {
        console.log('✅ УСПЕШНО сохранено в БД');
        // Обновляем бекап только после успешного сохранения в БД
        localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
        console.log('💾 Бекап обновлен в localStorage');
        window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: true } }));
      } else {
        console.log('❌ ОШИБКА сохранения в БД - сохраняем только в localStorage');
        // БД недоступна, но сохраняем в localStorage чтобы не потерять изменения
        localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
        console.log('🆘 Изменения сохранены в localStorage (БД недоступна)');
        window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: false, savedToLocal: true } }));
      }
    } else {
      // Отложенное сохранение с debounce
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      
      saveTimeout = setTimeout(async () => {
        console.log('⏰ ОТЛОЖЕННОЕ сохранение в БД...');
        const dbSaved = await saveContentToDatabase(content);
        
        if (dbSaved) {
          console.log('✅ УСПЕШНО сохранено в БД (отложенно)');
          // Обновляем бекап только после успешного сохранения в БД
          localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
          console.log('💾 Бекап обновлен в localStorage');
          window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: true } }));
        } else {
          console.log('❌ ОШИБКА отложенного сохранения в БД - сохраняем только в localStorage');
          // БД недоступна, но сохраняем в localStorage чтобы не потерять изменения
          localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
          console.log('🆘 Изменения сохранены в localStorage (БД недоступна)');
          window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: false, savedToLocal: true } }));
        }
      }, SAVE_DELAY);
    }
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в saveContent:', error);
    // В случае критической ошибки сохраняем в localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
      console.log('🆘 КРИТИЧЕСКИЙ бекап в localStorage');
      window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: false, savedToLocal: true, error: error.message } }));
    } catch (localError) {
      console.error('🆘 КРИТИЧЕСКАЯ ОШИБКА: Не удалось сохранить даже в localStorage:', localError);
      window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: false, error: localError.message } }));
    }
  }
};

export const loadContent = async (): Promise<SiteContent> => {
  try {
    console.log('📥 НАЧИНАЕМ ЗАГРУЗКУ...');
    console.log('🌐 Пробуем загрузить из БД...');
    
    // Пытаемся загрузить из БД
    const dbContent = await loadContentFromDatabase();
    
    if (dbContent) {
      // БД доступна и содержит данные
      console.log('✅ ДАННЫЕ ЗАГРУЖЕНЫ ИЗ БД');
      const fixedContent = fixBlockOrder(dbContent);
      // Обновляем бекап в localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fixedContent));
      console.log('💾 Бекап обновлен в localStorage');
      return fixedContent;
    }
    
    // БД доступна, но пуста (нет записей) ИЛИ БД недоступна
    console.log('⚠️ БД пуста или недоступна - проверяем localStorage...');
    
    // Проверяем localStorage
    const backupContent = localStorage.getItem(STORAGE_KEY);
    if (backupContent) {
      try {
        const content = JSON.parse(backupContent);
        console.log('💾 ДАННЫЕ ЗАГРУЖЕНЫ ИЗ localStorage (бекап)');
        return fixBlockOrder(content);
      } catch (parseError) {
        console.error('❌ Ошибка парсинга бекапа из localStorage:', parseError);
        // Удаляем поврежденный бекап
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    
    // Нет данных ни в БД, ни в localStorage - используем дефолт
    console.log('📦 НЕТ ДАННЫХ НИГДЕ - используем дефолтный контент');
    const defaultFixedContent = fixBlockOrder(defaultContent);
    
    // ❌ НЕ СОХРАНЯЕМ дефолт автоматически!
    // Пользователь должен сам сохранить, если захочет
    
    return defaultFixedContent;
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в loadContent:', error);
    
    // При критической ошибке пробуем localStorage
    try {
      const backupContent = localStorage.getItem(STORAGE_KEY);
      if (backupContent) {
        console.log('🆘 КРИТИЧЕСКИЙ РЕЖИМ: используем бекап из localStorage');
        const content = JSON.parse(backupContent);
        return fixBlockOrder(content);
      }
    } catch (backupError) {
      console.error('❌ Ошибка загрузки критического бекапа:', backupError);
    }
    
    // Последний резерв - дефолтный контент
    console.log('🆘 ПОСЛЕДНИЙ РЕЗЕРВ: дефолтный контент');
    return fixBlockOrder(defaultContent);
  }
};

// Функция для исправления порядка блоков
const fixBlockOrder = (content: SiteContent): SiteContent => {
  console.log('🔧 Fixing block order');
  console.log('Current blocks:', content.blocks.map(b => ({ id: b.id, title: b.title, order: b.order, type: b.type })));
  
  const reorderedBlocks = content.blocks.map(block => {
    // Системные блоки с фиксированным порядком
    if (block.id === 'hero') return { ...block, order: 1 };
    if (block.id === 'features') return { ...block, order: 2 };
    if (block.id === 'modules') return { ...block, order: 3 };
    if (block.id === 'can-module') return { ...block, order: 4 };
    if (block.id === 'analog-module') return { ...block, order: 5 }; 
    if (block.id === 'ops-module') return { ...block, order: 6 };
    
    // Специальная проверка для блока АБС по названию
    if (block.title && (block.title.includes('АБС') || block.title.includes('абс'))) {
      console.log(`🎯 Found ABS block: "${block.title}" - setting order = 7`);
      return { ...block, order: 7, type: 'custom' };
    }
    
    // Пользовательские блоки - между OPS (6) и видео (50)
    if (block.type === 'custom') {
      const customBlocks = content.blocks.filter(b => b.type === 'custom');
      const customIndex = customBlocks.findIndex(b => b.id === block.id);
      const newOrder = 7 + customIndex;
      console.log(`📦 Custom block "${block.title}" (${block.id}): ${block.order} -> ${newOrder}`);
      return { ...block, order: newOrder };
    }
    
    // Видео и контакты в конце
    if (block.id === 'videos') return { ...block, order: 50 };
    if (block.id === 'contacts') return { ...block, order: 51 };
    
    // Остальные блоки сохраняют свой порядок
    return block;
  });
  
  console.log('✅ New block order:', reorderedBlocks.map(b => ({ id: b.id, title: b.title, order: b.order, type: b.type })));
  
  return {
    ...content,
    blocks: reorderedBlocks
  };
};

export const loadContentSync = (): SiteContent => {
  try {
    // Синхронная загрузка только из бекапа localStorage
    const backupContent = localStorage.getItem(STORAGE_KEY);
    if (backupContent) {
      console.log('💾 Загружен бекап из localStorage (синхронно)');
      const content = JSON.parse(backupContent);
      return fixBlockOrder(content);
    }
  } catch (error) {
    console.error('❌ Error loading backup sync:', error);
  }
  console.log('📦 Using default content (sync fallback)');
  return fixBlockOrder(defaultContent);
};

export const resetContent = (): SiteContent => {
  // Очищаем бекап в localStorage
  localStorage.removeItem(STORAGE_KEY);
  console.log('🗑️ Бекап в localStorage очищен');
  
  // Возвращаем дефолтный контент БЕЗ автоматического сохранения
  const ukrainianContent = fixBlockOrder(defaultContent);
  console.log('📦 Reset to default content');
  
  return ukrainianContent;
};

export const exportContent = (): string => {
  const content = loadContentSync();
  return JSON.stringify(content, null, 2);
};

export const importContent = (jsonString: string): SiteContent => {
  try {
    const content = JSON.parse(jsonString);
    return content;
  } catch (error) {
    console.error('❌ Error importing content:', error);
    throw new Error('Invalid JSON format');
  }
};

// Функция для принудительной синхронизации с базой данных
export const forceSyncWithDatabase = async (): Promise<boolean> => {
  try {
    console.log('🔄 Принудительная синхронизация с БД...');
    const localContent = loadContentSync();
    const success = await saveContentToDatabase(localContent);
    if (success) {
      console.log('✅ Принудительная синхронизация успешна');
      // Обновляем бекап после успешной синхронизации
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localContent));
      window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: true } }));
    } else {
      console.log('❌ Принудительная синхронизация не удалась');
      window.dispatchEvent(new CustomEvent('contentSaved', { detail: { success: false } }));
    }
    return success;
  } catch (error) {
    console.error('❌ Error in force sync:', error);
    return false;
  }
};

// Функция для загрузки из базы данных с перезаписью localStorage
export const loadFromDatabaseAndOverwrite = async (): Promise<SiteContent> => {
  try {
    console.log('🔄 Загрузка из БД с перезаписью localStorage...');
    const dbContent = await loadContentFromDatabase();
    if (dbContent) {
      const fixedContent = fixBlockOrder(dbContent);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fixedContent));
      console.log('✅ Контент загружен из БД и сохранен в localStorage');
      return fixedContent;
    } else {
      console.log('⚠️ Нет контента в БД, оставляем текущий localStorage');
      return loadContentSync();
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки из БД:', error);
    return loadContentSync();
  }
};

// Функция для проверки доступности БД
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    console.log('🔍 Проверка соединения с БД...');
    const dbContent = await loadContentFromDatabase();
    // Если функция выполнилась без ошибки, БД доступна
    console.log('✅ БД доступна');
    return true;
  } catch (error) {
    console.error('❌ БД недоступна:', error);
    return false;
  }
};

// Функция для получения статуса источников данных
export const getDataSourcesStatus = async (): Promise<{
  database: boolean;
  localStorage: boolean;
  hasLocalData: boolean;
  hasDatabaseData: boolean;
}> => {
  const status = {
    database: false,
    localStorage: false,
    hasLocalData: false,
    hasDatabaseData: false
  };

  // Проверяем БД
  try {
    const dbContent = await loadContentFromDatabase();
    status.database = true;
    status.hasDatabaseData = !!dbContent;
  } catch (error) {
    status.database = false;
  }

  // Проверяем localStorage
  try {
    const localContent = localStorage.getItem(STORAGE_KEY);
    status.localStorage = true;
    status.hasLocalData = !!localContent;
  } catch (error) {
    status.localStorage = false;
  }

  return status;
};