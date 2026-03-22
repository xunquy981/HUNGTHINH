
import { BadgeProps } from '../components/ui/Primitives';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusDefinition {
    variant: Variant;
    label: string;
    icon?: string;
    animate?: boolean;
}

const STATUS_MAP: Record<string, Record<string, StatusDefinition>> = {
    'default': {
        'completed': { variant: 'success', label: 'Hoàn tất', icon: 'check_circle' },
        'paid': { variant: 'success', label: 'Đã tất toán', icon: 'paid' },
        'success': { variant: 'success', label: 'Thành công', icon: 'check' },
        'pending': { variant: 'neutral', label: 'Đang chờ', icon: 'hourglass_empty' },
        'draft': { variant: 'neutral', label: 'Bản nháp', icon: 'edit_document' },
        'processing': { variant: 'info', label: 'Đang xử lý', icon: 'sync', animate: true },
        'shipping': { variant: 'info', label: 'Đang điều vận', icon: 'local_shipping', animate: true },
        'warning': { variant: 'warning', label: 'Cảnh báo', icon: 'warning' },
        'partial': { variant: 'warning', label: 'Một phần', icon: 'partially_engaged' },
        'error': { variant: 'danger', label: 'Lỗi hệ thống', icon: 'error' },
        'cancelled': { variant: 'danger', label: 'Đã hủy bỏ', icon: 'cancel' },
        'void': { variant: 'neutral', label: 'Đã vô hiệu', icon: 'block' },
    },
    'Order': {
        'PendingPayment': { variant: 'warning', label: 'Chờ thanh toán', icon: 'payments' },
        'Processing': { variant: 'info', label: 'Đang soạn hàng', icon: 'package_2', animate: true },
        'Shipping': { variant: 'info', label: 'Vận chuyển', icon: 'local_shipping', animate: true },
        'PartiallyShipped': { variant: 'warning', label: 'Giao một phần', icon: 'inventory' },
        'Completed': { variant: 'success', label: 'Đã hoàn tất', icon: 'task_alt' },
        'Cancelled': { variant: 'danger', label: 'Đã hủy đơn', icon: 'cancel' },
        'Returned': { variant: 'danger', label: 'Đã trả hàng', icon: 'assignment_return' },
    },
    'Payment': { 
        'Paid': { variant: 'success', label: 'Đã thanh toán', icon: 'verified' },
        'Unpaid': { variant: 'danger', label: 'Chưa thanh toán', icon: 'money_off' },
        'Partial': { variant: 'warning', label: 'Thanh toán một phần', icon: 'pie_chart' },
    },
    'Fulfillment': { 
        'NotShipped': { variant: 'neutral', label: 'Chờ xuất kho', icon: 'inventory_2' },
        'Shipped': { variant: 'info', label: 'Đã xuất kho', icon: 'outbound' },
        'Delivered': { variant: 'success', label: 'Đã bàn giao', icon: 'done_all' },
        'Returned': { variant: 'danger', label: 'Hàng trả về', icon: 'assignment_return' },
    },
    'Quote': {
        'Draft': { variant: 'neutral', label: 'Đang soạn', icon: 'edit_note' },
        'Sent': { variant: 'info', label: 'Đã gửi khách', icon: 'forward_to_inbox' },
        'Accepted': { variant: 'success', label: 'Khách đã chốt', icon: 'thumb_up' },
        'Rejected': { variant: 'danger', label: 'Khách từ chối', icon: 'thumb_down' },
        'Expired': { variant: 'danger', label: 'Đã hết hạn', icon: 'timer_off' },
        'Cancelled': { variant: 'neutral', label: 'Đã hủy bỏ', icon: 'close' },
    },
    'Import': {
        'Pending': { variant: 'neutral', label: 'Chờ nhập hàng', icon: 'history' },
        'Receiving': { variant: 'warning', label: 'Đang kiểm đếm', icon: 'move_to_inbox', animate: true },
        'Received': { variant: 'success', label: 'Đã vào kho', icon: 'check_circle' },
        'Completed': { variant: 'success', label: 'Hoàn tất nhập', icon: 'done_all' },
        'Cancelled': { variant: 'danger', label: 'Hủy phiếu nhập', icon: 'block' },
    },
    'Debt': {
        'Pending': { variant: 'info', label: 'Trong hạn', icon: 'schedule' },
        'Partial': { variant: 'warning', label: 'Nợ một phần', icon: 'monitoring' },
        'Paid': { variant: 'success', label: 'Đã tất toán', icon: 'verified_user' },
        'Overdue': { variant: 'danger', label: 'Nợ quá hạn', icon: 'event_busy' },
        'DueSoon': { variant: 'warning', label: 'Sắp đến hạn', icon: 'notification_important' },
        'Void': { variant: 'neutral', label: 'Đã bù trừ', icon: 'delete_sweep' },
        'Normal': { variant: 'success', label: 'Bình thường', icon: 'check' },
    },
    'Delivery': {
        'Pending': { variant: 'neutral', label: 'Chờ điều vận', icon: 'pending_actions' },
        'Shipping': { variant: 'info', label: 'Đang đi giao', icon: 'delivery_dining', animate: true },
        'Delivered': { variant: 'success', label: 'Giao thành công', icon: 'verified' },
        'Cancelled': { variant: 'danger', label: 'Lỗi bàn giao', icon: 'wrong_location' },
    }
};

export const getStatusBadgeProps = (status: string, entityType: string = 'default'): StatusDefinition => {
    const map = STATUS_MAP[entityType] || STATUS_MAP['default'];
    if (map[status]) return map[status];
    const lowerKey = status?.toLowerCase();
    const generic = STATUS_MAP['default'];
    if (generic && generic[lowerKey]) return generic[lowerKey];
    return { variant: 'neutral', label: status || 'Không xác định', icon: 'help_outline' };
};
