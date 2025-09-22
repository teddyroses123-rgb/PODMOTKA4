import { createClient } from '@supabase/supabase-js';
import { SiteContent } from '../types/content';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const adminSecret = import.meta.env.VITE_ADMIN_SECRET;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables not found');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export const saveContentToDatabase = async (content: SiteContent): Promise<boolean> => {
  try {
    console.log('🔄 ПОПЫТКА СОХРАНЕНИЯ В БД...');
    
    // Check if Supabase URL is available
    if (!supabaseUrl) {
      console.error('❌ SUPABASE_URL не найден в переменных окружения');
      return false;
    }

    // Используем Edge Function для сохранения с правильными правами доступа
    const response = await fetch(`${supabaseUrl}/functions/v1/save-content`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: content,
        adminSecret: adminSecret || 'podmotka1122_admin_secret'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ОШИБКА СОХРАНЕНИЯ В БД:', errorText);
      return false;
    }

    const result = await response.json();
    if (result.success) {
      console.log('✅ КОНТЕНТ УСПЕШНО СОХРАНЕН В БАЗУ ДАННЫХ!');
    } else {
      console.error('❌ ОШИБКА СОХРАНЕНИЯ В БД:', result.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА СОХРАНЕНИЯ В БД:', error);
    return false;
  }
};

export const loadContentFromDatabase = async (): Promise<SiteContent | null> => {
  try {
    console.log('🔄 ЗАГРУЗКА ИЗ БД...');
    
    const { data, error, count } = await supabase
      .from('site_content')
      .select('content')
      .eq('id', 'main');

    if (error) {
      // Если ошибка не связана с отсутствием записей, выбрасываем её
      if (error.code !== 'PGRST116') {
        console.error('❌ ОШИБКА ЗАГРУЗКИ ИЗ БД:', error.message);
        throw new Error(error.message);
      }
      // Если записей нет (PGRST116), возвращаем null
      console.log('ℹ️ Записей в БД нет, возвращаем null');
      return null;
    }

    // Проверяем есть ли данные
    if (!data || data.length === 0 || !data[0]?.content) {
      console.log('✅ КОНТЕНТ УСПЕШНО ЗАГРУЖЕН ИЗ БД');
      return data.content as SiteContent;
    }

    console.log('✅ Контент загружен из БД');
    return data[0].content as SiteContent;
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА ЗАГРУЗКИ ИЗ БД:', error);
    return null;
  }
};