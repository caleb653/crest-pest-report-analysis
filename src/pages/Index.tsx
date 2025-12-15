import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect directly to the blank report page
    navigate('/report', { replace: true });
  }, [navigate]);

  return null;
};

export default Index;
