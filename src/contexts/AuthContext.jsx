import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'airleakage_auth_session';

// Đọc danh sách 3 tài khoản từ file .env
export function getPredefinedAccounts() {
  return [
    {
      username: import.meta.env.VITE_USER_1_USERNAME || 'user1',
      password: import.meta.env.VITE_USER_1_PASSWORD || 'password123',
    },
    {
      username: import.meta.env.VITE_USER_2_USERNAME || 'admin',
      password: import.meta.env.VITE_USER_2_PASSWORD || 'admin@123',
    },
    {
      username: import.meta.env.VITE_USER_3_USERNAME || 'user2',
      password: import.meta.env.VITE_USER_3_PASSWORD || '123456',
    },
  ];
}

export function AuthProvider({ children }) {
  // Chỉ lưu vào sessionStorage -> Đóng chương trình/trình duyệt sẽ tự động đăng xuất
  const [user, setUser] = useState(() => {
    try {
      const savedUser = sessionStorage.getItem(STORAGE_KEY);
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const accounts = getPredefinedAccounts();

  const login = (username, password) => {
    const trimmedUser = (username || '').trim();
    const trimmedPass = (password || '').trim();

    const matchedAccount = accounts.find(
      (acc) =>
        acc.username.toLowerCase() === trimmedUser.toLowerCase() &&
        acc.password === trimmedPass
    );

    if (!matchedAccount) {
      return {
        success: false,
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác!',
      };
    }

    const authUserData = {
      username: matchedAccount.username,
      loggedInAt: new Date().toISOString(),
    };

    // Lưu vào sessionStorage để tự hủy khi tắt ứng dụng
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(authUserData));
    setUser(authUserData);

    return {
      success: true,
      user: authUserData,
    };
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Error clearing session:', err);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        login,
        logout,
        accounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
