# -*- encoding: utf-8 -*-
##############################################################################
#    Copyright (c) 2012 - Present Acespritech Solutions Pvt. Ltd. All Rights Reserved
#    Author: <info@acespritech.com>
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    A copy of the GNU General Public License is available at:
#    <http://www.gnu.org/licenses/gpl.html>.
#
##############################################################################
# 
from openerp import fields, models, api, _
from datetime import timedelta
from datetime import datetime
import time

class pos_coupon(models.Model):
    _name = "pos.coupon"

    @api.multi
    def _get_cust(self):
        users_obj = self.env['res.users'].browse(self._uid)
        company_id = users_obj.company_id.id
        return company_id

    company_id = fields.Many2one('res.company', 'Company', readonly=True, default=_get_cust)
    name= fields.Char('Description', size=128)
    validity = fields.Integer('Validity')
    date_create = fields.Date('Issue Date', readonly=True, default=lambda *a: time.strftime('%Y-%m-%d'))
    date_expiry = fields.Date('Expiry Date', readonly=True)
    line_ids = fields.One2many('pos.coupon.line', 'coupon_id', 'Lines')
    coupon_history = fields.One2many('pos.coupon.history', 'coupon_id', 'Hostory Lines', readonly=True)

    @api.model
    def create(self, vals):
        if self._context is None:
            self._context = {}
        date_create = time.strftime("%Y:%m:%d")
        date_formatted_create = datetime.strptime(date_create , '%Y:%m:%d')
        validity = int(vals.get('validity', False))
        vals['date_create'] = date_formatted_create
        vals['date_expiry'] = date_formatted_create + timedelta(days=validity)
        res = super(pos_coupon, self).create(vals)
        return res

    @api.multi
    def write(self, vals):
        if self._context is None:
            self._context = {}
        if vals.get('validity', False):
            validity = int(vals.get('validity', False))
            date_create = self.browse(self.ids).date_create
            date_formatted_create = datetime.strptime(date_create, '%Y-%m-%d')
            vals['date_expiry'] = date_formatted_create + timedelta(days=validity)
        res = super(pos_coupon, self).write(vals)
        return res
pos_coupon()

class pos_coupon_line(models.Model):
    _name = "pos.coupon.line"
    
    @api.one
    def _compute_is_manager_default(self):
        group_id = self.env['ir.model.data'].get_object_reference('pos_spantree_8', 'group_coupon_manager')[1]
        group = self.env['res.groups'].browse(group_id)
        if self.env.user in group.users:
            self.group_coupon_manager = True
            return True
        self.group_coupon_manager = False
        return False

    @api.multi
    def _compute_is_manager(self):
        group_id = self.env['ir.model.data'].get_object_reference('pos_spantree_8', 'group_coupon_manager')[1]
        group = self.env['res.groups'].browse(group_id)
        for res in self:
            if res.env.user in group.users:
                res.group_coupon_manager = True
                return True
            res.group_coupon_manager = False
        return False
        
    name = fields.Char('Coupon Serial', size=264)
    amount = fields.Float('Amount')
    remaining_amt = fields.Float('Remaining Amount', readonly=True)
    product_id = fields.Many2one('product.product', 'Product', required=True)
    coupon_id = fields.Many2one('pos.coupon', 'Coupon')
    validity = fields.Integer(related='coupon_id.validity', store=True, string="Validity", readonly=True)
    date_create_line = fields.Date(related='coupon_id.date_create', store=True, string="Issue Date", readonly=True)
    date_expiry_line = fields.Date(related='coupon_id.date_expiry', store=True, string="Expiry Date", readonly=True)
    group_coupon_manager = fields.Boolean('Coupon Manager', compute='_compute_is_manager', default=_compute_is_manager_default)
    
pos_coupon_line()

class pos_coupon_history(models.Model):
    _name = "pos.coupon.history"
        
    name = fields.Char('Coupon Serial', size=264)
    used_amount = fields.Float('Used Amount')
    used_date = fields.Date('Used Date')
    coupon_id = fields.Many2one('pos.coupon', 'Coupon')
    pos_order = fields.Char('POS Order')
pos_coupon_history()

class product_template(models.Model):
    _inherit = "product.template"

    is_coupon = fields.Boolean('Is Coupon')
product_template()

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: